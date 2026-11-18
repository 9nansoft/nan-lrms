// Maternity assessment (LR) types — the three HOSxP `asm_*` nursing forms
// NN-LRMS pulls from every community hospital.
//
// A form row is positional in HOSxP (`asm_text12` = "BP", `asm_chk7` = a
// checkbox, `asm_memo3` = free text). The app resolves each column to its
// label from `assessment_items` BEFORE persisting, so the cache and the UI
// never depend on a hardcoded field list.

import type { MaternityAssessmentKey } from '@/config/maternity-assessments';

export type { MaternityAssessmentKey };

/** Widget family HOSxP recorded for a column (`assessment_component_name`). */
export type MaternityAssessmentComponent =
  | 'TextEdit'
  | 'CheckBox'
  | 'ComboBox'
  | 'LookupComboBox'
  | 'Memo'
  | 'DateEdit'
  | 'TimeEdit'
  | 'NumberEdit'
  | 'Unknown';

export interface MaternityAssessmentField {
  /** HOSxP column the value came from (`asm_text12`). */
  column: string;
  /** Thai label resolved from `assessment_items` (falls back to the column). */
  label: string;
  /** Widget family — drives how the value is rendered. */
  component: MaternityAssessmentComponent;
  /** HOSxP declared data type (informational). */
  dataType: string | null;
  /** The value, as text. Empty values are never persisted. */
  value: string;
  /** True when `value` is AES-256-GCM ciphertext (name-bearing columns). */
  encrypted: boolean;
}

/** One assessment form instance, ready for the UI. */
export interface MaternityAssessmentDto {
  id: string;
  formKey: MaternityAssessmentKey;
  formTable: string;
  /** Form name as HOSxP knows it (Thai), or the app's short title. */
  formName: string;
  /** When the form was recorded (HOSxP `assessment_head_datetime`). */
  recordedAt: string;
  /** The form's own clinical date (`asm_date*`), when the form has one. */
  recordedDate: string | null;
  /** HOSxP login of the staff who recorded the form (not a display name). */
  entryStaff: string | null;
  fields: MaternityAssessmentField[];
}

export interface MaternityAssessmentsResponse {
  assessments: MaternityAssessmentDto[];
}

/** Raw HOSxP row as the BMS Session API returns it. */
export interface HosxpAssessmentRow {
  [column: string]: unknown;
}

/** `assessment_form` metadata row. */
export interface HosxpAssessmentFormRow {
  assessment_form_id: number | string;
  assessment_form_table: string;
  assessment_form_name: string | null;
}

/** `assessment_items` metadata row (joined with `assessment_component`). */
export interface HosxpAssessmentItemRow {
  assessment_form_id: number | string;
  assessment_items_column: string;
  assessment_items_note: string | null;
  assessment_component_name: string | null;
  assessment_data_type: string | null;
}
