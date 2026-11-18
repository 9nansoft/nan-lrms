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
import { encrypt, getEncryptionKey } from '@/lib/encryption';
import { BmsSessionClient } from '@/lib/bms-session';
import { APP_IDENTIFIER } from '@/lib/bms-browser-client';
import { buildAssessmentKeysSqlFor } from '@/config/hosxp-queries';
import {
  MATERNITY_ASSESSMENT_FORMS,
  assessmentFormByTable,
  type MaternityAssessmentForm,
  type MaternityAssessmentKey,
} from '@/config/maternity-assessments';
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
  /** Per form: the keys that reached the cache. */
  persistedPks: Record<string, string[]>;
  /** Per form: the keys that were delivered but can never be stored. */
  rejectedPks: Record<string, string[]>;
  /** Per form: the keys the database refused. */
  failedPks: Record<string, string[]>;
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
): { rows: MaternityAssessmentRow[]; skipped: number; rejectedPks: string[] } {
  const rows: MaternityAssessmentRow[] = [];
  const rejectedPks: string[] = [];
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
      if (pk) rejectedPks.push(pk);
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

  return { rows, skipped, rejectedPks };
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
  const rejectedPks: Record<string, string[]> = {};
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
      if (result.rejectedPks.length > 0) {
        rejectedPks[form.table] = [...(rejectedPks[form.table] ?? []), ...result.rejectedPks];
      }
      for (const row of result.rows) normalized.push({ ...row, hospitalId });
    }
  }

  const { upserted, failed, persistedPks, failedPks } = await upsertMaternityAssessments(
    db,
    hospitalId,
    normalized,
  );
  return { upserted, skipped, failed, persistedPks, rejectedPks, failedPks };
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
  /** The keys that were delivered but can never be stored. */
  rejected: string[];
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
  const passed = new Set([...progress.persisted, ...progress.rejected]);
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
 * The server's own session for the hospital's HOSxP, refreshed when it has
 * expired — the same move the legacy poller makes. Without it the cursor
 * check would stop working the moment the stored session ages out.
 */
async function serverBmsSession(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<{ bmsUrl: string; jwt: string } | null> {
  const configs = await db.query<{
    tunnel_url: string | null;
    session_jwt: string | null;
    session_expires_at: string | Date | null;
  }>(
    `SELECT tunnel_url, session_jwt, session_expires_at
       FROM hospital_bms_config
      WHERE hospital_id = ?`,
    [hospitalId],
  );
  const config = configs[0];
  if (!config?.tunnel_url) return null;

  const expiresAt = config.session_expires_at ? new Date(config.session_expires_at).getTime() : 0;
  const expired = !config.session_jwt || expiresAt <= Date.now();
  if (!expired) {
    return { bmsUrl: config.tunnel_url, jwt: config.session_jwt as string };
  }

  // Refresh the tunnel session the way the poller does.
  try {
    const client = new BmsSessionClient(config.tunnel_url);
    const sessionId = await client.getSessionId();
    const validateUrl = process.env.BMS_VALIDATE_URL ?? 'https://hosxp.net/phapi/PasteJSON';
    const session = await client.validateSession(sessionId, validateUrl);
    await db.execute(
      `UPDATE hospital_bms_config
          SET session_jwt = ?, session_expires_at = ?
        WHERE hospital_id = ?`,
      [session.jwt, session.expiresAt.toISOString(), hospitalId],
    );
    return { bmsUrl: session.bmsUrl || config.tunnel_url, jwt: session.jwt };
  } catch {
    return config.session_jwt ? { bmsUrl: config.tunnel_url, jwt: config.session_jwt } : null;
  }
}

/**
 * Ask HOSxP which keys of a form exist above the current cursor.
 *
 * This is what makes the cursor server-observed: the browser can claim any
 * key it likes, but only a key HOSxP confirms moves the cursor — and only
 * when every key below it was delivered too.
 */
export async function verifyAssessmentCursorAdvance(
  db: DatabaseAdapter,
  hospitalId: string,
  cursors: Record<string, string>,
): Promise<Record<string, { authoritative: string[]; verified: boolean }>> {
  const session = await serverBmsSession(db, hospitalId);
  const result: Record<string, { authoritative: string[]; verified: boolean }> = {};
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    if (!session) {
      result[form.table] = { authoritative: [], verified: false };
      continue;
    }
    try {
      const client = new BmsSessionClient(session.bmsUrl);
      const sql = buildAssessmentKeysSqlFor(form.table, form.pkColumn, cursors[form.table] ?? '0');
      const res = await client.executeQuery(sql, session.bmsUrl, session.jwt, undefined, {
        appIdentifier: APP_IDENTIFIER,
      });
      const authoritative = (res.data as Record<string, unknown>[])
        .map((row) => String(row[form.pkColumn]))
        .filter((key) => /^\d{1,18}$/.test(key))
        .sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : 1));
      result[form.table] = { authoritative, verified: true };
    } catch {
      // HOSxP could not be reached — the cursor does not move for this form.
      result[form.table] = { authoritative: [], verified: false };
    }
  }
  return result;
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
 * The primary keys the browser delivered, per form — the "delivered" side of
 * the cursor progression.
 */
export function pulledPksByTable(input: AssessmentSyncInput): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    const pks: string[] = [];
    for (const raw of input.records[form.table] ?? []) {
      const pk = raw[form.pkColumn];
      const value = typeof pk === 'number' ? String(pk) : String(pk ?? '').trim();
      if (/^\d{1,18}$/.test(value)) pks.push(value);
    }
    if (pks.length > 0) out[form.table] = pks;
  }
  return out;
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

// ─── Payload validation (browser push) ──────────────────────────────────────
//
// The browser pushes the raw rows it read from HOSxP, so the payload is
// untrusted input: the table keys must be forms the app knows, the column
// names must look like HOSxP columns, and the volume must stay bounded.

/** Ceiling on rows per table in one push (a full pull is ~500). */
export const ASSESSMENT_MAX_ROWS_PER_TABLE = 2000;
/** Ceiling on columns per row (the widest HOSxP form has ~190). */
export const ASSESSMENT_MAX_COLUMNS_PER_ROW = 400;
/** Ceiling on form metadata rows in one push (3 forms × a few versions). */
export const ASSESSMENT_MAX_FORMS = 20;
/** Ceiling on item metadata rows in one push (~120 per form version). */
export const ASSESSMENT_MAX_ITEMS = 5000;
const COLUMN_NAME = /^[a-z][a-z0-9_]*$/;

export interface AssessmentPayload {
  forms: HosxpAssessmentFormRow[];
  items: HosxpAssessmentItemRow[];
  records: AssessmentRecordsByTable;
}

export interface AssessmentPayloadValidation {
  valid: boolean;
  error?: string;
  payload?: AssessmentPayload;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Validate the assessment section of a browser push. */
export function validateAssessmentPayload(body: unknown): AssessmentPayloadValidation {
  if (!isPlainObject(body)) {
    return { valid: false, error: 'assessments payload is not an object' };
  }
  const { forms, items, records } = body;

  if (!Array.isArray(forms) || !Array.isArray(items) || !isPlainObject(records)) {
    return { valid: false, error: 'assessments payload has a malformed section' };
  }
  if (forms.length > ASSESSMENT_MAX_FORMS) {
    return { valid: false, error: 'too many assessment forms in the payload' };
  }
  if (items.length > ASSESSMENT_MAX_ITEMS) {
    return { valid: false, error: 'too many assessment items in the payload' };
  }

  const knownTables = new Set(MATERNITY_ASSESSMENT_FORMS.map((f) => f.table));
  const cleanRecords: AssessmentRecordsByTable = {};
  for (const [table, rows] of Object.entries(records)) {
    if (!knownTables.has(table)) {
      return { valid: false, error: `unknown assessment table: ${table}` };
    }
    if (!Array.isArray(rows)) {
      return { valid: false, error: `assessment rows for ${table} are not an array` };
    }
    if (rows.length > ASSESSMENT_MAX_ROWS_PER_TABLE) {
      return { valid: false, error: `too many assessment rows for ${table}` };
    }
    const cleanRows: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (!isPlainObject(row)) {
        return { valid: false, error: `assessment row for ${table} is not an object` };
      }
      const keys = Object.keys(row);
      if (keys.length > ASSESSMENT_MAX_COLUMNS_PER_ROW) {
        return { valid: false, error: `assessment row for ${table} has too many columns` };
      }
      cleanRows.push(row);
    }
    cleanRecords[table] = cleanRows;
  }

  const cleanForms: HosxpAssessmentFormRow[] = [];
  const knownFormIds = new Set<number>();
  for (const form of forms) {
    if (!isPlainObject(form))
      return { valid: false, error: 'assessment form row is not an object' };
    const table = typeof form.assessment_form_table === 'string' ? form.assessment_form_table : '';
    const formId = Number(form.assessment_form_id);
    if (!knownTables.has(table) || !Number.isInteger(formId)) {
      return { valid: false, error: 'assessment form row is malformed' };
    }
    knownFormIds.add(formId);
    cleanForms.push({
      assessment_form_id: formId,
      assessment_form_table: table,
      assessment_form_name:
        typeof form.assessment_form_name === 'string' ? form.assessment_form_name : null,
    });
  }

  const cleanItems: HosxpAssessmentItemRow[] = [];
  for (const item of items) {
    if (!isPlainObject(item))
      return { valid: false, error: 'assessment item row is not an object' };
    const formId = Number(item.assessment_form_id);
    const column = item.assessment_items_column;
    if (!Number.isInteger(formId) || typeof column !== 'string' || !COLUMN_NAME.test(column)) {
      return { valid: false, error: 'assessment item row is malformed' };
    }
    if (!knownFormIds.has(formId)) {
      return { valid: false, error: `assessment item row references unknown form ${formId}` };
    }
    cleanItems.push({
      assessment_form_id: formId,
      assessment_items_column: column,
      assessment_items_note:
        typeof item.assessment_items_note === 'string' ? item.assessment_items_note : null,
      assessment_component_name:
        typeof item.assessment_component_name === 'string' ? item.assessment_component_name : null,
      assessment_data_type:
        typeof item.assessment_data_type === 'string' ? item.assessment_data_type : null,
    });
  }

  return { valid: true, payload: { forms: cleanForms, items: cleanItems, records: cleanRecords } };
}
