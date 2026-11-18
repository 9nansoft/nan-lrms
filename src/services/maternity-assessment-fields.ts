// Shared, client-safe helpers for the HOSxP maternity assessment forms.
//
// A HOSxP assessment row is positional: `asm_text12` holds a BP reading,
// `asm_chk7` a checkbox, `asm_memo3` free text. The MEANING lives in
// `assessment_items`, so every consumer has to resolve the columns to their
// labels before showing them.
//
// This module holds that resolution because BOTH sides need it: the sync
// (server-side, encrypting the name-bearing columns on the way into the
// cache) and the hospital console (browser-side, reading HOSxP live). It
// imports nothing node-only so it can ship in the client bundle.
import {
  MATERNITY_ASSESSMENT_FORMS,
  isNameBearingColumn,
} from '@/config/maternity-assessments';
import type {
  HosxpAssessmentItemRow,
  MaternityAssessmentComponent,
  MaternityAssessmentField,
} from '@/types/maternity-assessments';

/** Columns that carry the row's identity/context, not form content. */
const NON_FIELD_COLUMNS = new Set([
  'an',
  'vn',
  'vnan',
  'patient_type',
  'assessment_head_id',
  'head_datetime',
  'head_staff',
  'head_form_id',
  'patient_hn',
]);

/** Protects a name-bearing value; returns the value to store plus a flag. */
export type NameProtector = (value: string) => { value: string; encrypted: boolean };

/** The identity/context columns of a raw HOSxP assessment row. */
export interface AssessmentRowMeta {
  pk: string | null;
  an: string | null;
  hn: string | null;
  recordedAt: string | null;
  recordedDate: string | null;
  entryStaff: string | null;
}

export function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

export function assessmentComponent(name: string | null | undefined): MaternityAssessmentComponent {
  switch (name) {
    case 'TextEdit':
    case 'CheckBox':
    case 'ComboBox':
    case 'LookupComboBox':
    case 'Memo':
    case 'DateEdit':
    case 'TimeEdit':
    case 'NumberEdit':
      return name;
    default:
      return 'Unknown';
  }
}

/**
 * The identity/context of a raw row. `dateColumns` are the form's own date
 * columns, most significant first.
 */
export function readAssessmentRowMeta(
  raw: Record<string, unknown>,
  pkColumn: string,
  dateColumns: readonly string[],
): AssessmentRowMeta {
  let recordedDate: string | null = null;
  for (const column of dateColumns) {
    const value = str(raw[column]);
    if (value) {
      recordedDate = value;
      break;
    }
  }
  return {
    pk: str(raw[pkColumn]),
    an: str(raw.an),
    hn: str(raw.patient_hn),
    recordedAt: str(raw.head_datetime),
    recordedDate,
    entryStaff: str(raw.head_staff),
  };
}

/**
 * The labelled fields of a raw row. Empty values are dropped; a column the
 * form does not describe keeps its HOSxP name as the label.
 *
 * `protectName` is applied to the name-bearing columns (asm_lk*, user_login).
 * The sync passes an encrypting protector (PDPA: names are encrypted at
 * rest); the hospital console passes none — it renders the site's own live
 * data, the same way the rest of its tabs do.
 */
export function buildAssessmentFields(
  raw: Record<string, unknown>,
  items: Map<string, HosxpAssessmentItemRow>,
  pkColumn: string,
  protectName?: NameProtector,
): MaternityAssessmentField[] {
  const fields: MaternityAssessmentField[] = [];
  for (const [column, value] of Object.entries(raw)) {
    if (NON_FIELD_COLUMNS.has(column)) continue;
    if (column === pkColumn) continue;
    if (!column.startsWith('asm_') && column !== 'user_login') continue;
    const text = str(value);
    if (text === null) continue;

    const item = items.get(column);
    const protectedValue =
      isNameBearingColumn(column) && protectName
        ? protectName(text)
        : { value: text, encrypted: false };
    if (protectedValue.value === '') continue;

    fields.push({
      column,
      label: item?.assessment_items_note?.trim() || column,
      component: assessmentComponent(item?.assessment_component_name),
      dataType: item?.assessment_data_type ?? null,
      value: protectedValue.value,
      encrypted: protectedValue.encrypted,
    });
  }
  return fields;
}

/** `assessment_items` rows of one form, keyed by column. */
export function assessmentItemsByColumn(
  items: HosxpAssessmentItemRow[],
  formId: number,
): Map<string, HosxpAssessmentItemRow> {
  const map = new Map<string, HosxpAssessmentItemRow>();
  for (const item of items) {
    if (Number(item.assessment_form_id) !== formId) continue;
    map.set(item.assessment_items_column, item);
  }
  return map;
}

/** The newest form id per HOSxP table (a site can keep an older version). */
export function newestFormIdByTable(forms: HosxpAssessmentFormRowLike[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const form of forms) {
    const table = str(form.assessment_form_table);
    const formId = Number(form.assessment_form_id);
    if (!table || !Number.isInteger(formId)) continue;
    const current = map.get(table);
    if (current === undefined || formId > current) map.set(table, formId);
  }
  return map;
}

export interface HosxpAssessmentFormRowLike {
  assessment_form_id: number | string;
  assessment_form_table: string;
  assessment_form_name?: string | null;
}

/** The form's Thai name (HOSxP's own), falling back to the app's short title. */
export function assessmentFormName(table: string, formName: string | null | undefined): string {
  if (formName && formName.trim()) return formName.trim();
  return MATERNITY_ASSESSMENT_FORMS.find((f) => f.table === table)?.titleTh ?? table;
}
