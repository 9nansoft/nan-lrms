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
