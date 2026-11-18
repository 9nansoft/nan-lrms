// Maternity assessment (LR) ingestion — HOSxP `asm_*` forms → cache.
//
// A HOSxP assessment row is positional: `asm_text12` holds a BP reading,
// `asm_chk7` a checkbox, `asm_memo3` free text, `asm_lk1` the recording
// nurse. The MEANING lives in `assessment_items`; this service resolves
// every column to its label BEFORE the row is persisted, so the cache and
// the UI never depend on a hardcoded field list and a site that customised
// its form still renders its own labels.
//
// Name-bearing columns (asm_lk*, user_login) are AES-256-GCM encrypted
// before they are written; `fields_json` marks those entries so the read
// boundary knows to decrypt them.
//
// Callers (browser-poll push, server polling) hand over the RAW rows plus
// the form metadata; this service owns normalisation and persistence so
// both paths store identical rows.
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
  /** `assessment_form` rows for the three maternity forms. */
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
  /** Rows the caller had to drop (no PK / no AN / no timestamp). */
  skipped: number;
}

/** One-year backfill on the first run of a hospital. */
export const ASSESSMENT_BACKFILL_LOOKBACK_DAYS = 365;
/** Re-read window so a row edited shortly after it was pulled is not lost. */
export const ASSESSMENT_REFRESH_OVERLAP_DAYS = 2;
const DAY_MS = 24 * 3600_000;

/**
 * Cutoff for the next assessment pull: the newest row already in the cache
 * minus a small overlap, or a one-year backfill when the hospital has none.
 *
 * Derived from the cache itself (no extra state table), exactly like the
 * newborn sync's cutoff — a poisoned future timestamp can never push the
 * cutoff past today.
 */
export async function assessmentSyncCutoffDate(
  db: DatabaseAdapter,
  hospitalId: string,
  now: Date = new Date(),
): Promise<string> {
  const rows = await db.query<{ max_recorded: string | null }>(
    `SELECT MAX(recorded_at) AS max_recorded
       FROM cached_maternity_assessments
      WHERE hospital_id = ?`,
    [hospitalId],
  );
  const maxRecorded = rows[0]?.max_recorded;
  const baseMs = maxRecorded
    ? parseRecordedAt(maxRecorded).getTime() - ASSESSMENT_REFRESH_OVERLAP_DAYS * DAY_MS
    : now.getTime() - ASSESSMENT_BACKFILL_LOOKBACK_DAYS * DAY_MS;
  return new Date(Math.min(baseMs, now.getTime())).toISOString().slice(0, 10);
}

/**
 * HOSxP writes `assessment_head_datetime` without a timezone (Thai local
 * time). Parsing it as UTC keeps the cutoff arithmetic independent of the
 * server's timezone — otherwise the same cache would yield a different
 * cutoff on a machine set to Asia/Bangkok.
 */
function parseRecordedAt(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  const parsed = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

/** Encrypt a name-bearing value; drop it when no encryption key is set. */
function protectName(
  value: string,
  encryptionKey: string | null,
): {
  value: string;
  encrypted: boolean;
} {
  if (!encryptionKey) return { value: '', encrypted: false };
  return { value: encrypt(value, encryptionKey), encrypted: true };
}

export interface NormalizeOptions {
  /** AES key for name-bearing columns; null drops those values (fail closed). */
  encryptionKey: string | null;
  /** Patient id per AN — resolved once for the whole batch. */
  patientIdByAn?: Map<string, string>;
}

/**
 * Turn the raw rows of ONE form into cache rows. Rows without a primary
 * key, an AN or a recording timestamp are dropped: they cannot be linked to
 * a patient or ordered in time.
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
    if (!meta.pk || !meta.an || !meta.recordedAt) {
      skipped += 1;
      continue;
    }

    const fields = buildAssessmentFields(raw, items, form.pkColumn, (value) =>
      protectName(value, options.encryptionKey),
    );

    rows.push({
      hospitalId: '',
      patientId: options.patientIdByAn?.get(meta.an) ?? null,
      an: meta.an,
      hn: meta.hn,
      sourceSystem: 'HOSXP',
      sourcePk: `${form.table}:${meta.pk}`,
      formKey: form.key,
      formTable: form.table,
      formName: assessmentFormName(form.table, formName),
      recordedAt: meta.recordedAt,
      recordedDate: meta.recordedDate,
      entryStaff: meta.entryStaff,
      fields,
    });
  }

  return { rows, skipped };
}

/**
 * Normalise + persist every assessment form in one transaction.
 *
 * `patient_id` is resolved from the AN the form carries; a form whose
 * patient is not in the cache is still stored (with a null patient_id) so
 * the data is not lost.
 */
export async function syncMaternityAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  input: AssessmentSyncInput,
  options: { encryptionKey?: string | null } = {},
): Promise<AssessmentSyncResult> {
  const encryptionKey = options.encryptionKey ?? safeEncryptionKey();

  // A site can keep an older version of the same form — the highest id wins.
  const formIdByTable = newestFormIdByTable(input.forms);
  const formNameByTable = new Map<string, string>();
  for (const form of input.forms) {
    const table = form.assessment_form_table;
    if (!assessmentFormByTable(table)) continue;
    if (formIdByTable.get(table) !== Number(form.assessment_form_id)) continue;
    if (form.assessment_form_name) formNameByTable.set(table, form.assessment_form_name);
  }

  // AN -> patient_id, one query for the whole batch.
  const allAns = new Set<string>();
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    for (const raw of input.records[form.table] ?? []) {
      const an = str(raw.an);
      if (an) allAns.add(an);
    }
  }
  const patientIdByAn = await resolvePatientIds(db, hospitalId, [...allAns]);

  const normalized: MaternityAssessmentRow[] = [];
  let skipped = 0;
  for (const form of MATERNITY_ASSESSMENT_FORMS) {
    const rawRows = input.records[form.table] ?? [];
    if (rawRows.length === 0) continue;
    const formId = formIdByTable.get(form.table);
    const items =
      formId !== undefined
        ? assessmentItemsByColumn(input.items, formId)
        : new Map<string, HosxpAssessmentItemRow>();
    const result = normalizeAssessmentRows(
      form,
      rawRows,
      items,
      formNameByTable.get(form.table) ?? null,
      { encryptionKey, patientIdByAn },
    );
    skipped += result.skipped;
    for (const row of result.rows) normalized.push({ ...row, hospitalId });
  }

  const upserted = await upsertMaternityAssessments(db, hospitalId, normalized);
  return { upserted, skipped };
}

/**
 * Upsert the normalised rows. One transaction per batch so a mid-batch
 * failure cannot leave half a form persisted.
 */
export async function upsertMaternityAssessments(
  db: DatabaseAdapter,
  hospitalId: string,
  rows: MaternityAssessmentRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();

  return db.transaction(async (tx) => {
    let count = 0;
    for (const row of rows) {
      await tx.execute(
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
      count += 1;
    }
    return count;
  });
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

/** Ceiling on rows per table in one push (a full backfill is ~1k). */
export const ASSESSMENT_MAX_ROWS_PER_TABLE = 5000;
/** Ceiling on columns per row (the widest HOSxP form has ~190). */
export const ASSESSMENT_MAX_COLUMNS_PER_ROW = 400;
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
  for (const form of forms) {
    if (!isPlainObject(form))
      return { valid: false, error: 'assessment form row is not an object' };
    const table = typeof form.assessment_form_table === 'string' ? form.assessment_form_table : '';
    const formId = Number(form.assessment_form_id);
    if (!knownTables.has(table) || !Number.isInteger(formId)) {
      return { valid: false, error: 'assessment form row is malformed' };
    }
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
