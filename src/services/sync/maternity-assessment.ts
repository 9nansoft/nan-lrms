// Maternity assessment (LR) ingestion — HOSxP `asm_*` forms → cache.
//
// A HOSxP assessment row is positional: `asm_text12` holds a BP reading,
// `asm_chk7` a checkbox, `asm_memo3` free text, `asm_lk1` the recording
// nurse. The MEANING lives in `assessment_items`; this service resolves
// every column to its label BEFORE the row is persisted, so the cache and
// the UI never depend on a hardcoded field list and a site that customised
// its form still renders its own labels.
//
// Three properties this module is responsible for:
//
//  1. NO ROW IS LOST. Each form has its own cursor (the primary key of the
//     last row pulled for it) and the next pull asks for everything above
//     that key. A date-based window would stall on a form that holds
//     hundreds of rows on one day, and one shared cursor across the three
//     forms would skip the backlog of the form that is used least.
//  2. ONE BAD ROW CANNOT BLOCK THE REST. Every row is validated before it
//     is written and written on its own: a row HOSxP filled with a zero
//     date or an over-long value is dropped, not allowed to roll back the
//     batch and freeze the form forever.
//  3. NAMES DO NOT SIT IN THE CACHE IN CLEAR. The name-bearing columns
//     (asm_lk*, user_login — the recording nurse, and at some sites the
//     patient) are AES-256-GCM encrypted before they are written.
//
// Callers (browser-poll push, server polling) hand over the RAW rows plus
// the form metadata; this service owns normalisation and persistence so both
// paths store identical rows.
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { encrypt, getEncryptionKey, decryptSafe } from '@/lib/encryption';
import { BmsSessionClient } from '@/lib/bms-session';
import { APP_IDENTIFIER } from '@/lib/bms-browser-client';
import { logger } from '@/lib/logger';
import {
  ASSESSMENT_ROW_LIMIT,
  buildAssessmentItemsSql,
  buildAssessmentRecordsSqlFor,
  buildAssessmentReconcileSqlFor,
} from '@/config/hosxp-queries';
import {
  MATERNITY_ASSESSMENT_FORMS,
  ASSESSMENT_METADATA_CACHE_TTL_MS,
  ASSESSMENT_RECONCILE_WINDOW_DAYS,
  assessmentFormByTable,
  type MaternityAssessmentForm,
  type MaternityAssessmentKey,
} from '@/config/maternity-assessments';
import {
  assessmentMetadataCoversAllForms,
  isAssessmentMetadataCacheFresh,
  readAssessmentMetadataCache,
  writeAssessmentMetadataCache,
  type AssessmentMetadata,
} from '@/services/assessment-metadata-cache';
import {
  assessmentFormName,
  assessmentItemsByColumn,
  buildAssessmentFields,
  newestFormIdByTable,
  readAssessmentRowMeta,
  str,
} from '@/services/maternity-assessment-fields';
import type {
  HosxpAssessmentFormRow,
  HosxpAssessmentItemRow,
  MaternityAssessmentField,
} from '@/types/maternity-assessments';

/** Raw rows grouped by the HOSxP table they came from. */
export type AssessmentRecordsByTable = Record<string, Record<string, unknown>[]>;

export interface AssessmentSyncInput {
  /** `assessment_form` rows for the maternity forms. */
  forms: HosxpAssessmentFormRow[];
  /** `assessment_items` rows (with the component join) for those forms. */
  items: HosxpAssessmentItemRow[];
  /** Raw form rows, grouped by HOSxP table. */
  records: AssessmentRecordsByTable;
}

export interface MaternityAssessmentRow {
  hospitalId: string;
  patientId: string | null;
  an: string;
  hn: string | null;
  sourceSystem: 'HOSXP';
  sourcePk: string;
  formKey: MaternityAssessmentKey;
  formTable: string;
  formName: string;
  recordedAt: string;
  recordedDate: string | null;
  entryStaff: string | null;
  fields: MaternityAssessmentField[];
}

export interface AssessmentSyncResult {
  /** Rows written to the cache. */
  upserted: number;
  /** Rows the caller had to drop (no PK / no AN / no usable timestamp). */
  skipped: number;
  /** Rows the database refused — isolated, the rest of the batch landed. */
  failed: number;
  /** Cached rows removed because HOSxP does not have them any more. */
  deleted: number;
  /** Per form: the keys that reached the cache. */
  persistedPks: Record<string, string[]>;
  /** Per form: the keys that can never be stored (the server's own verdict
   *  on the rows it read). */
  unusablePks: Record<string, string[]>;
  /** Per form: the keys the database refused. */
  failedPks: Record<string, string[]>;
  /** The forms whose HOSxP query failed — the pull did NOT cover them. */
  failedForms: string[];
  /** Why the pull could not run at all (no HOSxP session). */
  error: string | null;
  /**
   * Why the form labels could not be read. The rows still land — with their
   * raw HOSxP column names when no cached label was available — so this must
   * be reported: a pull that looks healthy while every field reads
   * `asm_text12` is not healthy.
   */
  metadataError: string | null;
  /**
   * Why the reconciliation pass could not complete. The pull itself is
   * unaffected, but rows HOSxP deleted may still sit in the cache.
   */
  reconcileError: string | null;
}

// ─── Column widths (mirror src/db/tables/cached-maternity-assessments.ts) ──
const MAX_AN = 32;
const MAX_HN = 32;
const MAX_FORM_NAME = 250;
const MAX_ENTRY_STAFF = 150;
/** HOSxP stores the recorder's account name here (not a display name). */
const LOGIN_SHAPED = /^[A-Za-z0-9._-]{1,64}$/;

/** Encrypt a name-bearing value; drop it when no encryption key is set. */
function protectName(
  value: string,
  encryptionKey: string | null,
): { value: string; encrypted: boolean } {
  if (!encryptionKey) return { value: '', encrypted: false };
  return { value: encrypt(value, encryptionKey), encrypted: true };
}

/** The message of a thrown value, for logs and sync steps. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The form table the database says does not exist, if that is the error.
 *
 * PostgreSQL: `relation "asm_x" does not exist`; MariaDB: `Table
 * 'nanhosxp.asm_x' doesn't exist`. A site that does not use a form must not
 * look like a site whose pull failed.
 */
function missingFormTable(message: string): string | null {
  const postgres = /relation\s+"([^"]+)"\s+does not exist/i.exec(message);
  if (postgres) return postgres[1];
  const mysql = /table\s+'[^']*\.?([A-Za-z0-9_]+)'\s+doesn't exist/i.exec(message);
  if (mysql) return mysql[1];
  return null;
}

/** The host of a URL, or null when it cannot be read. */
function urlHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when a session points at the same tunnel as the hospital's config.
 *
 * The tunnel is hospital specific (10716-saciw.tunnel.hosxp.net), so a
 * session that points elsewhere belongs to another site. A LOCAL gateway
 * (127.0.0.1:45011 on the ward's workstation) is the one exception: its
 * host is never the tunnel's, and it is the hospital's own machine.
 */
function sameTunnel(configuredTunnel: string, sessionUrl: string): boolean {
  const configuredHost = urlHost(configuredTunnel);
  const sessionHost = urlHost(sessionUrl);
  if (!configuredHost || !sessionHost) return true; // cannot judge — do not block
  if (configuredHost === sessionHost) return true;
  const localHosts = ['127.0.0.1', 'localhost', '[::1]'];
  return localHosts.includes(configuredHost);
}

/** A timestamp we can store and order by — rejects HOSxP zero dates. */
function usableTimestamp(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(trimmed)) return null;
  const parsed = new Date(trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : trimmed;
}

export interface NormalizeOptions {
  /** AES key for name-bearing columns; null drops those values (fail closed). */
  encryptionKey: string | null;
  /** Patient id per AN — resolved once for the whole batch. */
  patientIdByAn?: Map<string, string>;
}

/**
 * Turn the raw rows of ONE form into cache rows. Rows without a primary
 * key, an AN or a usable recording timestamp are dropped: they cannot be
 * linked to a patient or ordered in time.
 */
export function normalizeAssessmentRows(
  form: MaternityAssessmentForm,
  rawRows: Record<string, unknown>[],
  items: Map<string, HosxpAssessmentItemRow>,
  formName: string | null,
  options: NormalizeOptions,
): { rows: MaternityAssessmentRow[]; skipped: number; unusablePks: string[] } {
  const rows: MaternityAssessmentRow[] = [];
  const unusablePks: string[] = [];
  let skipped = 0;

  for (const raw of rawRows) {
    const meta = readAssessmentRowMeta(raw, form.pkColumn, form.dateColumns);
    const pk = meta.pk && /^\d{1,18}$/.test(meta.pk) ? meta.pk : null;
    const an = meta.an && meta.an.length <= MAX_AN ? meta.an : null;
    const recordedAt = usableTimestamp(meta.recordedAt);
    if (!pk || !an || !recordedAt) {
      skipped += 1;
      // The row was delivered but can never be stored (no usable key, AN or
      // timestamp). It must not hold the form back: the cursor may pass it.
      if (pk) unusablePks.push(pk);
      continue;
    }

    const fields = buildAssessmentFields(raw, items, form.pkColumn, (value) =>
      protectName(value, options.encryptionKey),
    );

    rows.push({
      hospitalId: '',
      patientId: options.patientIdByAn?.get(an) ?? null,
      an,
      hn: meta.hn && meta.hn.length <= MAX_HN ? meta.hn : null,
      sourceSystem: 'HOSXP',
      sourcePk: `${form.table}:${pk}`,
      formKey: form.key,
      formTable: form.table,
      formName: assessmentFormName(form.table, formName).slice(0, MAX_FORM_NAME),
      recordedAt,
      recordedDate: meta.recordedDate,
      entryStaff:
        meta.entryStaff && LOGIN_SHAPED.test(meta.entryStaff)
          ? meta.entryStaff.slice(0, MAX_ENTRY_STAFF)
          : null,
      fields,
    });
  }

  return { rows, skipped, unusablePks };
}

/**
 * Normalise + persist every assessment form.
 *
 * `patient_id` is resolved from the AN the form carries; a form whose
 * patient is not in the cache is still stored (with a null patient_id) so
 * the data is not lost.
 *
 * Each row is written on its own: a row the database refuses is counted and
 * skipped, never allowed to roll back the rows around it.
 */
export async function syncMaternityAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  input: AssessmentSyncInput,
  options: { encryptionKey?: string | null } = {},
): Promise<AssessmentSyncResult> {
  const encryptionKey = options.encryptionKey ?? safeEncryptionKey();

  // A site can keep an older version of the same form — the highest id is
  // the current one, but older rows still carry their own form id and are
  // labelled with THAT version's items.
  const formIdByTable = newestFormIdByTable(input.forms);
  const formNameByTable = new Map<string, string>();
  for (const form of input.forms) {
    const table = form.assessment_form_table;
    if (!assessmentFormByTable(table)) continue;
    if (formIdByTable.get(table) !== Number(form.assessment_form_id)) continue;
    if (form.assessment_form_name) formNameByTable.set(table, form.assessment_form_name);
  }

  const itemsByFormId = new Map<number, Map<string, HosxpAssessmentItemRow>>();
  for (const formId of new Set(input.items.map((i) => Number(i.assessment_form_id)))) {
    if (!Number.isInteger(formId)) continue;
    itemsByFormId.set(formId, assessmentItemsByColumn(input.items, formId));
  }

  // AN -> patient_id, one query for the whole batch.
  const allAns = new Set<string>();
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    for (const raw of input.records[form.table] ?? []) {
      const an = str(raw.an);
      if (an && an.length <= MAX_AN) allAns.add(an);
    }
  }
  const patientIdByAn = await resolvePatientIds(db, hospitalId, [...allAns]);

  const normalized: MaternityAssessmentRow[] = [];
  const unusablePks: Record<string, string[]> = {};
  let skipped = 0;
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    const rawRows = input.records[form.table] ?? [];
    if (rawRows.length === 0) continue;

    // A row recorded under an older form version is labelled with THAT
    // version's items; a row whose form id we do not know (or that carries
    // none) falls back to the current version.
    const newestItems = itemsByFormId.get(formIdByTable.get(form.table) ?? -1) ?? new Map();
    const groups = new Map<string, Record<string, unknown>[]>();
    const itemsByGroup = new Map<string, Map<string, HosxpAssessmentItemRow>>();
    for (const raw of rawRows) {
      const rowFormId = Number(raw.head_form_id);
      const key =
        Number.isInteger(rowFormId) && itemsByFormId.has(rowFormId) ? String(rowFormId) : 'current';
      const bucket = groups.get(key);
      if (bucket) bucket.push(raw);
      else groups.set(key, [raw]);
      if (!itemsByGroup.has(key)) {
        itemsByGroup.set(key, key === 'current' ? newestItems : itemsByFormId.get(Number(key))!);
      }
    }

    for (const [key, rows] of groups) {
      const result = normalizeAssessmentRows(
        form,
        rows,
        itemsByGroup.get(key) ?? newestItems,
        formNameByTable.get(form.table) ?? null,
        { encryptionKey, patientIdByAn },
      );
      skipped += result.skipped;
      if (result.unusablePks.length > 0) {
        unusablePks[form.table] = [...(unusablePks[form.table] ?? []), ...result.unusablePks];
      }
      for (const row of result.rows) normalized.push({ ...row, hospitalId });
    }
  }

  const { upserted, failed, persistedPks, failedPks } = await upsertMaternityAssessments(
    db,
    hospitalId,
    normalized,
  );
  return {
    upserted,
    skipped,
    failed,
    deleted: 0,
    persistedPks,
    unusablePks,
    failedPks,
    failedForms: [],
    error: null,
    metadataError: null,
    reconcileError: null,
  };
}

/**
 * Upsert the normalised rows, one row at a time.
 *
 * A row the database refuses (a value too long for its column, a date
 * Postgres cannot parse) is counted and skipped — the rows around it still
 * land. Batching them into one statement would let a single bad row roll
 * the whole form back, and the form would never sync again.
 */
export async function upsertMaternityAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  rows: MaternityAssessmentRow[],
): Promise<{
  upserted: number;
  failed: number;
  persistedPks: Record<string, string[]>;
  failedPks: Record<string, string[]>;
}> {
  if (rows.length === 0) {
    return { upserted: 0, failed: 0, persistedPks: {}, failedPks: {} };
  }
  const now = new Date().toISOString();
  let upserted = 0;
  let failed = 0;
  const persistedPks: Record<string, string[]> = {};
  const failedPks: Record<string, string[]> = {};
  const pkOf = (row: MaternityAssessmentRow) => row.sourcePk.slice(row.sourcePk.indexOf(':') + 1);

  for (const row of rows) {
    try {
      await db.execute(
        `INSERT INTO cached_maternity_assessments (
           id, hospital_id, patient_id, an, hn, source_system, source_pk,
           form_key, form_table, form_name, recorded_at, recorded_date,
           entry_staff, fields_json, synced_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (hospital_id, source_system, source_pk) DO UPDATE SET
           patient_id = EXCLUDED.patient_id,
           an = EXCLUDED.an,
           hn = EXCLUDED.hn,
           form_key = EXCLUDED.form_key,
           form_table = EXCLUDED.form_table,
           form_name = EXCLUDED.form_name,
           recorded_at = EXCLUDED.recorded_at,
           recorded_date = EXCLUDED.recorded_date,
           entry_staff = EXCLUDED.entry_staff,
           fields_json = EXCLUDED.fields_json,
           synced_at = EXCLUDED.synced_at,
           updated_at = EXCLUDED.updated_at`,
        [
          uuidv4(),
          hospitalId,
          row.patientId,
          row.an,
          row.hn,
          row.sourceSystem,
          row.sourcePk,
          row.formKey,
          row.formTable,
          row.formName,
          row.recordedAt,
          row.recordedDate,
          row.entryStaff,
          JSON.stringify(row.fields),
          now,
          now,
          now,
        ],
      );
      upserted += 1;
      (persistedPks[row.formTable] ??= []).push(pkOf(row));
    } catch {
      // One bad row must not cost the form its other rows.
      failed += 1;
      (failedPks[row.formTable] ??= []).push(pkOf(row));
    }
  }

  return { upserted, failed, persistedPks, failedPks };
}

// ─── Cursors ────────────────────────────────────────────────────────────────
//
// The cursor is the SERVER's position in the hospital's HOSxP: the highest
// primary key of a form that the server has taken delivery of, in order,
// with nothing skipped in between.
//
// It advances CONTIGUOUSLY. HOSxP is asked which keys of the form exist
// above the cursor; the cursor only moves past a key the browser really
// delivered AND that reached the cache (or that can never be stored — a
// malformed row is delivered, and holding the form back for it would lose
// every row behind it). A key the browser skipped, or one the database
// refused, stops the progression: the row behind it is pulled again next
// cycle instead of being skipped for good.
//
// When the server cannot reach HOSxP the cursor does not move at all. The
// rows still land (the push is idempotent), so nothing is lost — only the
// pull position waits until HOSxP can be asked again.

/** The pull position of every maternity form of one hospital, by table. */
export async function readAssessmentCursors(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<Record<string, string>> {
  const rows = await db.query<{ form_table: string; cursor_pk: string }>(
    `SELECT form_table, cursor_pk
       FROM cached_maternity_assessment_cursors
      WHERE hospital_id = ?`,
    [hospitalId],
  );
  const cursors: Record<string, string> = {};
  for (const row of rows) {
    if (/^\d{1,18}$/.test(row.cursor_pk)) cursors[row.form_table] = row.cursor_pk;
  }
  return cursors;
}

/** What the server knows about one form's progress in a push. */
export interface AssessmentFormProgress {
  /** The keys HOSxP has above the cursor, ascending. */
  authoritative: string[];
  /** The keys the browser delivered. */
  delivered: string[];
  /** The keys that reached the cache. */
  persisted: string[];
  /** The keys the SERVER judged un-storable (no admission, no usable
   *  timestamp) — read from HOSxP, never taken on the browser's word. */
  unusable: string[];
  /** The keys the database refused — the progression stops before them. */
  failed: string[];
}

/**
 * The key the cursor may move to: the last key of the authoritative page
 * that the browser delivered and that either reached the cache or can never
 * be stored — stopping at the first key that was skipped or refused.
 */
export function resolveCursorAdvance(
  progress: AssessmentFormProgress,
  currentCursor: string,
): string | null {
  const delivered = new Set(progress.delivered);
  // Only a key that reached the cache, or that the SERVER judged un-storable,
  // may be crossed. A key the browser merely claims to have rejected is not
  // enough — that is the browser's own word.
  const passed = new Set([...progress.persisted, ...progress.unusable]);
  const failed = new Set(progress.failed);
  const current = BigInt(currentCursor || '0');

  let next: string | null = null;
  for (const key of progress.authoritative) {
    if (!/^\d{1,18}$/.test(key)) continue;
    const value = BigInt(key);
    if (value <= current) continue;
    if (failed.has(key)) break; // re-pulled next cycle
    if (!delivered.has(key)) break; // the browser skipped it — do not pass it
    if (!passed.has(key)) break; // delivered but not accounted for
    next = key;
  }
  return next;
}

/**
 * The server's own session for the hospital's HOSxP, plus the marketplace
 * token that scopes its queries.
 */
export interface HospitalBmsSession {
  bmsUrl: string;
  jwt: string;
  marketplaceToken: string | null;
}

/**
 * The server's own session for the hospital's HOSxP, refreshed when it has
 * expired.
 *
 * The server cannot mint a HOSxP session on its own: the tunnel's
 * /api/SessionID belongs to the LOCAL gateway on the ward's workstation and
 * a public tunnel answers "Access Denied". The only entity that holds a
 * live session id is the hospital's own browser — and it rides along with
 * every push (`bms_session_id`). So the refresh order is:
 *
 *   1. the stored session, while it is still valid;
 *   2. the session id the browser just pushed, exchanged for a bearer token;
 *   3. the tunnel's own session id, for a gateway that does expose it.
 *
 * The bearer token is stored back, so the next cycle starts from (1) again.
 */
async function serverBmsSession(
  db: DatabaseAdapter,
  hospitalId: string,
  options: { bmsSessionId?: string | null } = {},
): Promise<HospitalBmsSession | null> {
  const configs = await db.query<{
    tunnel_url: string | null;
    session_jwt: string | null;
    session_expires_at: string | Date | null;
    marketplace_token: string | null;
    hcode: string;
  }>(
    `SELECT c.tunnel_url, c.session_jwt, c.session_expires_at, c.marketplace_token,
            h.hcode
       FROM hospital_bms_config c
       JOIN hospitals h ON h.id = c.hospital_id
      WHERE c.hospital_id = ?`,
    [hospitalId],
  );
  const config = configs[0];
  if (!config?.tunnel_url) return null;

  const marketplaceToken = config.marketplace_token
    ? decryptSafe(config.marketplace_token) || null
    : null;

  const expiresAt = config.session_expires_at ? new Date(config.session_expires_at).getTime() : 0;
  const expired = !config.session_jwt || expiresAt <= Date.now();
  if (!expired) {
    return {
      bmsUrl: config.tunnel_url,
      jwt: config.session_jwt as string,
      marketplaceToken,
    };
  }

  const validateUrl = process.env.BMS_VALIDATE_URL ?? 'https://hosxp.net/phapi/PasteJSON';
  const client = new BmsSessionClient(config.tunnel_url);

  // The browser's session id is the one source that works from the server;
  // the tunnel's own id is the fallback for a gateway that exposes it. The
  // tunnel is asked only when the browser's id did not work — a public
  // tunnel answers "Access Denied", and waiting for that answer costs a
  // round trip on every refresh.
  const pushedSessionId = options.bmsSessionId?.trim();
  async function* candidateSessionIds(): AsyncGenerator<string> {
    if (pushedSessionId) yield pushedSessionId;
    try {
      yield await client.getSessionId();
    } catch (error) {
      logger.debug('assessment_tunnel_session_id_unavailable', {
        hospitalId,
        error: errorMessage(error),
      });
    }
  }

  for await (const sessionId of candidateSessionIds()) {
    try {
      const session = await client.validateSession(sessionId, validateUrl);
      // The pushed session must belong to THIS hospital. Two guards, because
      // either can be missing on a given site:
      //   1. the hospital code the session reports;
      //   2. the tunnel the session points at — the tunnel is hospital
      //      specific, so a session from another site points elsewhere. (A
      //      local gateway on the ward's workstation is skipped: its host is
      //      not the tunnel's.)
      const sessionHcode = session.userInfo.hospital_code?.trim();
      if (sessionHcode && config.hcode && sessionHcode !== config.hcode) {
        logger.warn('assessment_session_hospital_mismatch', {
          hospitalId,
          hcode: config.hcode,
          sessionHcode,
        });
        continue;
      }
      if (!sameTunnel(config.tunnel_url, session.bmsUrl)) {
        logger.warn('assessment_session_tunnel_mismatch', {
          hospitalId,
          tunnel: config.tunnel_url,
          sessionTunnel: session.bmsUrl,
        });
        continue;
      }
      await db.execute(
        `UPDATE hospital_bms_config
            SET session_jwt = ?, session_expires_at = ?
          WHERE hospital_id = ?`,
        [session.jwt, session.expiresAt.toISOString(), hospitalId],
      );
      logger.info('assessment_session_refreshed', { hospitalId, source: 'session_id' });
      return {
        bmsUrl: session.bmsUrl || config.tunnel_url,
        jwt: session.jwt,
        marketplaceToken,
      };
    } catch (error) {
      logger.warn('assessment_session_refresh_failed', {
        hospitalId,
        error: errorMessage(error),
      });
    }
  }

  // No fresh session. Fall back to the stored one — the gateway may still
  // accept it — but never report success on its basis.
  return config.session_jwt
    ? { bmsUrl: config.tunnel_url, jwt: config.session_jwt, marketplaceToken }
    : null;
}

/**
 * Move the cursor of every form to the position the server resolved. A form
 * whose position could not be verified keeps the cursor it has.
 */
export async function advanceAssessmentCursors(
  db: DatabaseAdapter,
  hospitalId: string,
  nextByTable: Record<string, string | null>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const [table, next] of Object.entries(nextByTable)) {
    if (!assessmentFormByTable(table)) continue;
    if (!next || !/^\d{1,18}$/.test(next)) continue;
    const existing = await db.query<{ id: string; cursor_pk: string }>(
      `SELECT id, cursor_pk
         FROM cached_maternity_assessment_cursors
        WHERE hospital_id = ? AND form_table = ?`,
      [hospitalId, table],
    );
    if (existing.length > 0) {
      if (BigInt(next) <= BigInt(existing[0].cursor_pk)) continue;
      await db.execute(
        `UPDATE cached_maternity_assessment_cursors
            SET cursor_pk = ?, updated_at = ?
          WHERE id = ?`,
        [next, now, existing[0].id],
      );
    } else {
      await db.execute(
        `INSERT INTO cached_maternity_assessment_cursors
           (id, hospital_id, form_table, cursor_pk, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), hospitalId, table, next, now],
      );
    }
  }
}

/**
 * The start of the reconciliation window, as the plain timestamp BOTH sides
 * compare against.
 *
 * HOSxP stores its clock as a local time without a zone, and the cache stores
 * that very string. The window read and the cache read therefore compare
 * NAIVE values — and they must compare against the SAME literal, or the two
 * sides would not agree on which rows are inside the window.
 *
 * The literal is the UTC clock without a zone. The hospital's clock is a few
 * hours ahead of it; a window of days does not care, and both sides shift
 * together.
 */
function reconcileWindowStart(now: Date): string {
  const start = new Date(now.getTime() - ASSESSMENT_RECONCILE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return start.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * The rows of one form to store: the cursor pull and the reconciliation
 * window, each row once.
 *
 * The window read repeats the rows the cursor pull already got — the window
 * is a re-read, not a new set. The cursor row wins, they are the same row.
 */
function mergeAssessmentRows(
  cursorRows: Record<string, unknown>[],
  windowRows: Record<string, unknown>[],
  pkColumn: string,
): Record<string, unknown>[] {
  const merged = new Map<string, Record<string, unknown>>();
  for (const row of cursorRows) merged.set(String(row[pkColumn]), row);
  for (const row of windowRows) {
    const key = String(row[pkColumn]);
    if (!merged.has(key)) merged.set(key, row);
  }
  return [...merged.values()];
}

/**
 * Drop the cached rows of one form that HOSxP no longer has.
 *
 * The window read is the authority for the window: a cached row whose
 * recording time falls inside the window and whose key the read did NOT
 * return is gone from HOSxP — deleted, or moved to another admission — and
 * must not stay in the cache for ever.
 */
export async function pruneDeletedAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  table: string,
  seenPks: Set<string>,
  since: string,
): Promise<number> {
  const cached = await db.query<{ source_pk: string }>(
    `SELECT source_pk
       FROM cached_maternity_assessments
      WHERE hospital_id = ? AND form_table = ? AND recorded_at >= ?`,
    [hospitalId, table, since],
  );
  let deleted = 0;
  for (const row of cached) {
    const pk = row.source_pk.slice(row.source_pk.indexOf(':') + 1);
    if (seenPks.has(pk)) continue;
    await db.execute(
      `DELETE FROM cached_maternity_assessments
        WHERE hospital_id = ? AND source_system = 'HOSXP' AND source_pk = ?`,
      [hospitalId, row.source_pk],
    );
    deleted += 1;
  }
  return deleted;
}

/**
 * Drop the cached rows the reconciliation window no longer holds.
 *
 * A form whose window read FAILED, or that hit the row limit, is left alone:
 * such a read does not know what is missing, and guessing would delete live
 * forms. The pass reports what it could not do instead.
 */
export async function pruneReconciledAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  windowRecords: AssessmentRecordsByTable,
  windowComplete: Record<string, boolean>,
  since: string,
): Promise<{ deleted: number; error: string | null }> {
  let deleted = 0;
  const failed: string[] = [];
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    if (!windowComplete[form.table]) continue;
    const rows = windowRecords[form.table] ?? [];
    const seen = new Set(
      rows
        .map((row) => String(row[form.pkColumn]))
        .filter((key) => /^\d{1,18}$/.test(key)),
    );
    try {
      deleted += await pruneDeletedAssessments(db, hospitalId, form.table, seen, since);
    } catch (error) {
      failed.push(form.table);
      logger.error('assessment_reconcile_prune_failed', {
        hospitalId,
        formTable: form.table,
        error: errorMessage(error),
      });
    }
  }
  return {
    deleted,
    error: failed.length > 0 ? `could not prune stale forms of: ${failed.join(', ')}` : null,
  };
}

/**
 * Pull the maternity assessment forms from HOSxP and store them.
 *
 * The SERVER reads the rows, so what lands in the cache is the hospital's own
 * HOSxP content — not a browser's report of it. The hospital's browser only
 * tells the server that something new exists (a cheap "what is the newest
 * key?" question); everything else here is the server's own work.
 *
 * The pull is bounded by the form's cursor, so a cycle that finds nothing
 * costs three index lookups, and a cycle that finds a lot takes the rows in
 * pages of ASSESSMENT_ROW_LIMIT.
 *
 * Every failure is reported: a form whose query failed is named in
 * `failedForms`, a pull without a HOSxP session carries the reason in
 * `error`. A cycle that pulled nothing must never look like a cycle that
 * found nothing.
 */
export async function pullMaternityAssessmentsFromHosxp(
  db: DatabaseAdapter,
  hospitalId: string,
  options: {
    encryptionKey?: string | null;
    /** A session the caller already holds (the legacy poller does). */
    bmsUrl?: string;
    jwt?: string;
    /** The marketplace token that scopes the queries (see hosxp-sync-status). */
    marketplaceToken?: string | null;
    /**
     * The BMS PasteJSON session id the hospital's browser pushed along with
     * the sync bundle — the server's only source of a fresh HOSxP session.
     */
    bmsSessionId?: string | null;
    /**
     * How long the label cache may be reused (defaults to
     * ASSESSMENT_METADATA_CACHE_TTL_MS).
     */
    assessmentMetadataTtlMs?: number;
    /**
     * The clock the cache freshness is judged against (defaults to now).
     */
    now?: Date;
    /**
     * Reconcile the recent window against the cache: re-read the rows of the
     * last ASSESSMENT_RECONCILE_WINDOW_DAYS days whatever their key is, and
     * drop the cached rows HOSxP no longer has.
     *
     * Off by default — the pass rewrites a window of rows and finds nothing
     * most of the time. The scheduler turns it on once an hour.
     */
    reconcile?: boolean;
  } = {},
): Promise<AssessmentSyncResult> {
  const empty: AssessmentSyncResult = {
    upserted: 0,
    skipped: 0,
    failed: 0,
    deleted: 0,
    persistedPks: {},
    unusablePks: {},
    failedPks: {},
    failedForms: [],
    error: null,
    metadataError: null,
    reconcileError: null,
  };
  const session =
    options.bmsUrl && options.jwt
      ? {
          bmsUrl: options.bmsUrl,
          jwt: options.jwt,
          marketplaceToken: options.marketplaceToken ?? null,
        }
      : await serverBmsSession(db, hospitalId, { bmsSessionId: options.bmsSessionId });
  if (!session) {
    return {
      ...empty,
      error:
        'no HOSxP session for this hospital — the browser must push its bms_session_id, ' +
        'or the hospital must be registered with a tunnel URL',
    };
  }

  const client = new BmsSessionClient(session.bmsUrl);
  const queryOptions = {
    appIdentifier: APP_IDENTIFIER,
    marketplaceToken: session.marketplaceToken,
  };
  const cursors = await readAssessmentCursors(db, hospitalId);
  const records: AssessmentRecordsByTable = {};
  const authoritativePks: Record<string, string[]> = {};
  const failedForms: string[] = [];

  // The reconciliation pass re-reads the recent window of every form — the
  // rows the cursor pull will never see again, because it only ever asks for
  // the keys ABOVE the cursor. Off by default: it rewrites a window of rows
  // and finds nothing most of the time. The scheduler turns it on once an
  // hour.
  const reconcile = options.reconcile === true;
  const now = options.now ?? new Date();
  const windowStart = reconcile ? reconcileWindowStart(now) : null;
  const windowRecords: AssessmentRecordsByTable = {};
  const windowComplete: Record<string, boolean> = {};
  const reconcileFailedForms: string[] = [];

  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    try {
      const sql = buildAssessmentRecordsSqlFor(
        form.table,
        form.pkColumn,
        cursors[form.table] ?? '0',
      );
      const res = await client.executeQuery(sql, session.bmsUrl, session.jwt, undefined, queryOptions);
      records[form.table] = res.data as Record<string, unknown>[];
      authoritativePks[form.table] = records[form.table]
        .map((row) => String(row[form.pkColumn]))
        .filter((key) => /^\d{1,18}$/.test(key));
    } catch (error) {
      records[form.table] = [];
      authoritativePks[form.table] = [];
      // A form the site does not use (the table does not exist there) is
      // not a failure — it must not cost the hospital the forms it does
      // use, and it must not turn every push into a warning.
      const missingTable = missingFormTable(errorMessage(error));
      if (missingTable === form.table) {
        logger.debug('assessment_form_not_in_use', { hospitalId, formTable: form.table });
        continue;
      }
      // Any other failure must be named, or the sync log reports an empty
      // pull as a healthy one.
      failedForms.push(form.table);
      logger.error('assessment_form_query_failed', {
        hospitalId,
        formTable: form.table,
        error: errorMessage(error),
      });
    }

    if (!reconcile || !windowStart) continue;
    try {
      const sql = buildAssessmentReconcileSqlFor(
        form.table,
        form.pkColumn,
        windowStart,
      );
      const res = await client.executeQuery(sql, session.bmsUrl, session.jwt, undefined, queryOptions);
      const rows = res.data as Record<string, unknown>[];
      windowRecords[form.table] = rows;
      // A read that hit the limit does not know what it did NOT see — the
      // window may hold more rows than it returned.
      windowComplete[form.table] = rows.length < ASSESSMENT_ROW_LIMIT;
    } catch (error) {
      windowRecords[form.table] = [];
      windowComplete[form.table] = false;
      const missingTable = missingFormTable(errorMessage(error));
      if (missingTable === form.table) {
        logger.debug('assessment_form_not_in_use', { hospitalId, formTable: form.table });
        continue;
      }
      reconcileFailedForms.push(form.table);
      logger.error('assessment_reconcile_query_failed', {
        hospitalId,
        formTable: form.table,
        error: errorMessage(error),
      });
    }
  }

  // The rows to store: the cursor pull plus the reconciliation window. The
  // window read repeats the rows the cursor pull already got — they are
  // stored once.
  const storeRecords: AssessmentRecordsByTable = {};
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    storeRecords[form.table] = mergeAssessmentRows(
      records[form.table] ?? [],
      windowRecords[form.table] ?? [],
      form.pkColumn,
    );
  }

  // The stale rows are dropped BEFORE the early return below: a window that
  // came back empty means every cached row of the window is gone from HOSxP,
  // and that must not be left behind in the cache.
  let deleted = 0;
  let reconcileError: string | null =
    reconcileFailedForms.length > 0
      ? `HOSxP reconcile query failed for: ${reconcileFailedForms.join(', ')}`
      : null;
  if (reconcile && windowStart) {
    const pruned = await pruneReconciledAssessments(
      db,
      hospitalId,
      windowRecords,
      windowComplete,
      windowStart,
    );
    deleted = pruned.deleted;
    reconcileError = reconcileError
      ? `${reconcileError}; ${pruned.error}`
      : pruned.error;
  }

  if (Object.values(storeRecords).every((rows) => rows.length === 0)) {
    return {
      ...empty,
      failedForms,
      deleted,
      error:
        failedForms.length > 0
          ? `HOSxP query failed for: ${failedForms.join(', ')}`
          : null,
      reconcileError,
    };
  }

  // The labels come from the site's own form definition. A form definition
  // changes only when the SITE changes its form, so the labels are kept in
  // the cache and reused: a fresh cache that covers every form answers the
  // pull without asking HOSxP at all.
  //
  // A metadata hiccup must not throw the fetched rows away: without labels
  // the fields keep their HOSxP column names, which is still a form — and a
  // stale cache still carries the labels of the last good read.
  const metadataTtlMs = options.assessmentMetadataTtlMs ?? ASSESSMENT_METADATA_CACHE_TTL_MS;

  let cached: AssessmentMetadata = { forms: [], items: [], coveredTables: [], syncedAt: null };
  let cacheFresh = false;
  try {
    // ONE round trip: the rows carry their stamp, so the freshness of the
    // cache is known without asking the database a second time.
    cached = await readAssessmentMetadataCache(db, hospitalId);
    cacheFresh = isAssessmentMetadataCacheFresh(cached.syncedAt, metadataTtlMs, now);
  } catch (error) {
    logger.warn('assessment_metadata_cache_read_failed', {
      hospitalId,
      error: errorMessage(error),
    });
  }

  // The cache may only answer the pull when it knows the form version the
  // pulled rows were recorded under. A site can publish a NEW version of a
  // form at any time; labelling a row of that version with an older
  // version's items would write the wrong label into the cache and the
  // cursor would walk past the row for good.
  //
  // An OLDER version the site no longer lists is an ORPHAN row: it falls
  // back to the current version's items, exactly as it did before the cache
  // existed — so it must NOT invalidate the cache (the pull would read the
  // metadata and rewrite the cache on every round, for ever).
  const pulled = pulledFormVersions(storeRecords);
  const newestCachedByTable = new Map<string, number>();
  for (const form of cached.forms) {
    const id = Number(form.assessment_form_id);
    const table = form.assessment_form_table;
    const current = newestCachedByTable.get(table);
    if (current === undefined || id > current) newestCachedByTable.set(table, id);
  }
  let cacheKnowsEveryForm = true;
  for (const [table, ids] of pulled) {
    const newestCached = newestCachedByTable.get(table);
    if (newestCached === undefined) {
      // The cache knows no form of this table — the site may have just
      // started using it, and the rows cannot be labelled from the cache.
      cacheKnowsEveryForm = false;
      break;
    }
    if (ids.some((id) => id > newestCached)) {
      // The site published a version NEWER than the cache knows.
      cacheKnowsEveryForm = false;
      break;
    }
  }
  // A cache of sentinels alone knows the tables but carries no label.
  const cacheHasLabels = cached.forms.length > 0;

  let metadata: Pick<AssessmentMetadata, 'forms' | 'items'> = { forms: [], items: [] };
  let metadataError: string | null = null;
  if (
    cacheFresh &&
    cacheHasLabels &&
    cacheKnowsEveryForm &&
    assessmentMetadataCoversAllForms(cached.coveredTables)
  ) {
    metadata = cached;
    logger.debug('assessment_metadata_cache_hit', { hospitalId });
  } else {
    let read = false;
    try {
      metadata = await readAssessmentMetadata(client, session, queryOptions);
      read = true;
    } catch (error) {
      // The rows still land — without labels they keep their raw HOSxP column
      // names, which is still a form. But the admins must SEE it: a pull
      // that looks healthy while every field reads `asm_text12` is not
      // healthy, so the reason travels with the result.
      metadataError = `HOSxP form metadata read failed: ${errorMessage(error)}`;
      logger.error('assessment_metadata_read_failed', {
        hospitalId,
        error: errorMessage(error),
      });
    }

    // HOSxP answered with no form at all: nothing was learned. The cache
    // must NOT be written — a fresh cache that holds no label would keep the
    // pull from reading the metadata for a whole TTL.
    const learned = read && metadata.forms.length > 0;
    if (read && !learned) {
      logger.warn('assessment_metadata_empty', { hospitalId });
    }
    if (learned) {
      try {
        await writeAssessmentMetadataCache(db, hospitalId, metadata.forms, metadata.items, now);
      } catch (error) {
        // A cache that cannot be written must not cost the pull its labels.
        logger.warn('assessment_metadata_cache_write_failed', {
          hospitalId,
          error: errorMessage(error),
        });
      }
    } else if (cacheHasLabels) {
      // The labels of the last good read are better than raw column names.
      metadata = cached;
      logger.warn('assessment_metadata_cache_stale_used', { hospitalId });
    }
  }

  const result = await syncMaternityAssessments(db, hospitalId, {
    forms: metadata.forms,
    items: metadata.items,
    records: storeRecords,
  });
  result.persistedPks = result.persistedPks ?? {};
  result.unusablePks = result.unusablePks ?? {};
  result.failedPks = result.failedPks ?? {};
  result.failedForms = failedForms;
  result.deleted = deleted;
  result.metadataError = metadataError;
  result.reconcileError = reconcileError;
  result.error =
    failedForms.length > 0 ? `HOSxP query failed for: ${failedForms.join(', ')}` : null;

  // The cursor moves only over the rows the server itself read and stored.
  const nextByTable: Record<string, string | null> = {};
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    const keys = authoritativePks[form.table] ?? [];
    nextByTable[form.table] = resolveCursorAdvance(
      {
        authoritative: [...keys].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1)),
        delivered: keys,
        persisted: result.persistedPks[form.table] ?? [],
        unusable: result.unusablePks[form.table] ?? [],
        failed: result.failedPks[form.table] ?? [],
      },
      cursors[form.table] ?? '0',
    );
  }
  await advanceAssessmentCursors(db, hospitalId, nextByTable);

  return result;
}

/**
 * The form versions the pulled rows were recorded under, per table.
 *
 * A row without a form id is not a version at all — `Number(null)` would
 * turn it into the id 0 and reject every cache that has no form 0.
 */
function pulledFormVersions(records: AssessmentRecordsByTable): Map<string, number[]> {
  const byTable = new Map<string, number[]>();
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    const rows = records[form.table] ?? [];
    if (rows.length === 0) continue;
    const ids: number[] = [];
    for (const raw of rows) {
      const rawId = raw.head_form_id;
      if (rawId === null || rawId === undefined || rawId === '') continue;
      const id = Number(rawId);
      if (!Number.isInteger(id) || id <= 0) continue;
      ids.push(id);
    }
    byTable.set(form.table, ids);
  }
  return byTable;
}

/** The form names and column labels of the three forms, read from HOSxP. */
async function readAssessmentMetadata(
  client: BmsSessionClient,
  session: { bmsUrl: string; jwt: string },
  queryOptions: { appIdentifier: string; marketplaceToken: string | null },
): Promise<{ forms: HosxpAssessmentFormRow[]; items: HosxpAssessmentItemRow[] }> {
  const tables = MATERNITY_ASSESSMENT_FORMS.map((f) => `'${f.table}'`).join(', ');
  const formsRes = await client.executeQuery(
    `SELECT assessment_form_id, assessment_form_table, assessment_form_name
       FROM assessment_form
      WHERE assessment_form_table IN (${tables})
      ORDER BY assessment_form_id DESC`,
    session.bmsUrl,
    session.jwt,
    undefined,
    queryOptions,
  );
  const forms = formsRes.data as unknown as HosxpAssessmentFormRow[];
  const formIds = forms
    .map((f) => Number(f.assessment_form_id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (formIds.length === 0) return { forms, items: [] };

  const itemsRes = await client.executeQuery(
    buildAssessmentItemsSql(formIds),
    session.bmsUrl,
    session.jwt,
    undefined,
    queryOptions,
  );
  return { forms, items: itemsRes.data as unknown as HosxpAssessmentItemRow[] };
}

async function resolvePatientIds(
  db: DatabaseAdapter,
  hospitalId: string,
  ans: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ans.length === 0) return map;
  // Chunked: a backfill can carry more ANs than a driver accepts as bound
  // parameters in one statement.
  const CHUNK = 500;
  for (let i = 0; i < ans.length; i += CHUNK) {
    const chunk = ans.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(', ');
    const rows = await db.query<{ id: string; an: string }>(
      `SELECT id, an FROM cached_patients WHERE hospital_id = ? AND an IN (${placeholders})`,
      [hospitalId, ...chunk],
    );
    for (const row of rows) map.set(row.an, row.id);
  }
  return map;
}

/** The encryption key, or null when it is not configured (names are dropped). */
export function safeEncryptionKey(): string | null {
  try {
    return getEncryptionKey();
  } catch {
    return null;
  }
}
