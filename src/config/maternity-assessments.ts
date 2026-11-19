// Maternity assessment forms (LR) — the three HOSxP `asm_*` assessment
// tables NN-LRMS pulls from every community hospital.
//
// HOSxP stores EVERY assessment form in a generic table whose columns are
// positional (`asm_text1..N`, `asm_chk1..N`, `asm_memo1..N`, `asm_lk1..N`,
// `asm_date*`, `asm_time*`, `asm_cbx*`). The MEANING of a column lives in
// `assessment_items` (column -> Thai label) and the form NAME lives in
// `assessment_form`. Neither is hardcoded here: the app pulls the metadata
// per hospital so a site that customised its form still renders its own
// labels.
//
// This file therefore holds only WHICH forms we pull and how we key them —
// never a field list.

export type MaternityAssessmentKey = 'first_pregnant' | 'birth_period' | 'after_birth';

export interface MaternityAssessmentForm {
  /** Stable app key for the form (used in URLs, DTOs and the cache). */
  key: MaternityAssessmentKey;
  /** HOSxP table the form rows live in. */
  table: string;
  /** HOSxP primary-key column of that table (`<table>_id`). */
  pkColumn: string;
  /** Short Thai title used when HOSxP has no form name for the table. */
  titleTh: string;
  /**
   * Date columns of the form, most-significant first. The first non-empty
   * one becomes the record's clinical date (`recorded_date`); the others
   * still show up in the field list with their own labels.
   */
  dateColumns: readonly string[];
}

export const MATERNITY_ASSESSMENT_FORMS: readonly MaternityAssessmentForm[] = [
  {
    key: 'first_pregnant',
    table: 'asm_first_pregnant_pt_nan',
    pkColumn: 'asm_first_pregnant_pt_nan_id',
    titleTh: 'แรกรับ',
    dateColumns: ['asm_date1', 'asm_date2', 'asm_date3'],
  },
  {
    key: 'birth_period',
    table: 'asm_lr_record_birth_period_nan',
    pkColumn: 'asm_lr_record_birth_period_nan_id',
    titleTh: 'ระยะคลอด',
    dateColumns: ['asm_date1'],
  },
  {
    key: 'after_birth',
    table: 'asm_lr_record_after_birth_nan',
    pkColumn: 'asm_lr_record_after_birth_nan_id',
    titleTh: 'หลังคลอด',
    dateColumns: ['asm_date1'],
  },
];

/**
 * How long the label cache (`assessment_form` / `assessment_items`) may be
 * reused before the pull reads it from HOSxP again.
 *
 * A form definition changes only when the SITE changes its form — a new
 * version of a nursing form, a renamed field. That happens a few times a
 * year at most, so a day is short enough to pick a customisation up
 * quickly and long enough to keep the metadata queries off every cycle.
 */
export const ASSESSMENT_METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How far back the reconciliation pass looks.
 *
 * The pull is cursor-driven, so a row HOSxP deleted — or one inserted with a
 * key BELOW the cursor — is never read again and would stay in the cache for
 * ever. The reconciliation pass re-reads the recent window whatever the key
 * is, and drops the cached rows the window no longer holds.
 *
 * A week is long enough to cover a form a nurse wrote last week and then
 * deleted, and short enough to keep the window small.
 */
export const ASSESSMENT_RECONCILE_WINDOW_DAYS = 7;

/**
 * How often one hospital's reconciliation pass runs.
 *
 * The pass re-reads a window of rows and rewrites them — far more work than
 * the incremental pull, and it finds nothing most of the time. An hour is
 * often enough for a deleted form to disappear from the cache, and rare
 * enough to keep the extra reads off every cycle.
 */
export const ASSESSMENT_RECONCILE_INTERVAL_MS = 60 * 60 * 1000;

export function assessmentFormByKey(key: string): MaternityAssessmentForm | undefined {
  return MATERNITY_ASSESSMENT_FORMS.find((f) => f.key === key);
}

export function assessmentFormByTable(table: string): MaternityAssessmentForm | undefined {
  return MATERNITY_ASSESSMENT_FORMS.find((f) => f.table === table);
}

/**
 * HOSxP tables whose rows hold a person's name. The assessment forms put the
 * recording nurse (and, at some sites, the patient herself) in `asm_lk*` and
 * `user_login`. Those values are personal data, so they are encrypted before
 * they reach the cache and decrypted only at the read boundary.
 */
export function isNameBearingColumn(column: string): boolean {
  return column.startsWith('asm_lk') || column === 'user_login';
}
