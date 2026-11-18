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
): { rows: MaternityAssessmentRow[]; skipped: number } {
  const rows: MaternityAssessmentRow[] = [];
  let skipped = 0;

  for (const raw of rawRows) {
    const meta = readAssessmentRowMeta(raw, form.pkColumn, form.dateColumns);
    const pk = meta.pk && /^\d{1,18}$/.test(meta.pk) ? meta.pk : null;
    const an = meta.an && meta.an.length <= MAX_AN ? meta.an : null;
    const recordedAt = usableTimestamp(meta.recordedAt);
    if (!pk || !an || !recordedAt) {
      skipped += 1;
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

  return { rows, skipped };
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
      for (const row of result.rows) normalized.push({ ...row, hospitalId });
    }
  }

  const { upserted, failed } = await upsertMaternityAssessments(db, hospitalId, normalized);
  return { upserted, skipped: skipped + failed, failed };
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
): Promise<{ upserted: number; failed: number }> {
  if (rows.length === 0) return { upserted: 0, failed: 0 };
  const now = new Date().toISOString();
  let upserted = 0;
  let failed = 0;

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
    } catch {
      // One bad row must not cost the form its other rows.
      failed += 1;
    }
  }

  return { upserted, failed };
}

// ─── Cursors ────────────────────────────────────────────────────────────────

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

/**
 * Move the cursor of every form forward to the highest primary key the sync
 * has PULLED — not the highest it managed to store. A row that fails to
 * store must not hold the form back, otherwise the rows behind it would
 * never be pulled.
 */
export async function advanceAssessmentCursors(
  db: DatabaseAdapter,
  hospitalId: string,
  maxPkByTable: Record<string, string>,
): Promise<void> {
  const now = new Date().toISOString();
  for (const [table, pk] of Object.entries(maxPkByTable)) {
    if (!assessmentFormByTable(table)) continue;
    if (!/^\d{1,18}$/.test(pk)) continue;
    const existing = await db.query<{ id: string; cursor_pk: string }>(
      `SELECT id, cursor_pk
         FROM cached_maternity_assessment_cursors
        WHERE hospital_id = ? AND form_table = ?`,
      [hospitalId, table],
    );
    if (existing.length > 0) {
      if (BigInt(pk) <= BigInt(existing[0].cursor_pk)) continue;
      await db.execute(
        `UPDATE cached_maternity_assessment_cursors
            SET cursor_pk = ?, updated_at = ?
          WHERE id = ?`,
        [pk, now, existing[0].id],
      );
    } else {
      await db.execute(
        `INSERT INTO cached_maternity_assessment_cursors
           (id, hospital_id, form_table, cursor_pk, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), hospitalId, table, pk, now],
      );
    }
  }
}

/**
 * The highest primary key of each form in a pushed batch — the position the
 * next pull resumes from.
 */
export function maxPulledPkByTable(input: AssessmentSyncInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    let max = BigInt(0);
    for (const raw of input.records[form.table] ?? []) {
      const pk = raw[form.pkColumn];
      const value = typeof pk === 'number' ? BigInt(pk) : BigInt(String(pk ?? '').trim() || '0');
      if (value > max) max = value;
    }
    if (max > BigInt(0)) out[form.table] = max.toString();
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
