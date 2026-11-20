// Pure grouping of one assessment record's fields into the form's on-screen
// layout (see src/config/assessment-form-layouts.ts).
//
// Everything the layout places is collected in the layout's own order; a
// field whose column the standard structure does not name survives in
// `unmapped`, so a site-customised form never loses what it recorded. No
// labels are invented here — the field's label comes from the site.
import type { MaternityAssessmentDto, MaternityAssessmentField } from '@/types/maternity-assessments';
import {
  fieldLayoutFor,
  timeRowLayoutFor,
  type AssessmentSectionSpec,
  type AssessmentTimeRowSpec,
} from '@/config/assessment-form-layouts';

export interface GroupedFieldSection {
  spec: AssessmentSectionSpec;
  /** The section's fields that carry a value, in the spec's order. */
  fields: MaternityAssessmentField[];
}

export interface GroupedFieldRecord {
  kind: 'fields';
  sections: GroupedFieldSection[];
  unmapped: MaternityAssessmentField[];
}

export interface GroupedTimeRow {
  spec: AssessmentTimeRowSpec;
  /** 1-based position on the form (ครั้งที่ N). */
  index: number;
  timeField: MaternityAssessmentField | null;
  staffField: MaternityAssessmentField | null;
  subjectFields: MaternityAssessmentField[];
  activityFields: MaternityAssessmentField[];
  /** False when the nurse left the whole row empty — the view skips it. */
  hasContent: boolean;
}

export interface GroupedTimeRowRecord {
  kind: 'time-rows';
  /** Grid column headings, as the form's own header reads. */
  subjectTitle: string;
  activityTitle: string;
  dateField: MaternityAssessmentField | null;
  rows: GroupedTimeRow[];
  footerFields: MaternityAssessmentField[];
  unmapped: MaternityAssessmentField[];
}

export type GroupedAssessment = GroupedFieldRecord | GroupedTimeRowRecord;

function fieldsForColumns(
  columns: readonly string[],
  byColumn: Map<string, MaternityAssessmentField>,
  consumed: Set<string>,
): MaternityAssessmentField[] {
  const fields: MaternityAssessmentField[] = [];
  for (const column of columns) {
    if (consumed.has(column)) continue;
    const field = byColumn.get(column);
    if (!field) continue;
    consumed.add(column);
    fields.push(field);
  }
  return fields;
}

function groupFieldsRecord(record: MaternityAssessmentDto): GroupedFieldRecord {
  const layout = fieldLayoutFor(record.formKey);
  const byColumn = new Map(record.fields.map((field) => [field.column, field]));
  const consumed = new Set<string>();
  const sections: GroupedFieldSection[] = [];

  if (layout) {
    for (const spec of layout.sections) {
      const fields: MaternityAssessmentField[] = [];
      if (spec.columns) fields.push(...fieldsForColumns(spec.columns, byColumn, consumed));
      for (const row of spec.labRows ?? []) {
        fields.push(...fieldsForColumns(row.cells.filter((c) => c !== null), byColumn, consumed));
      }
      for (const block of spec.riskBlocks ?? []) {
        fields.push(
          ...fieldsForColumns(
            [block.noColumn, block.yesColumn, block.memoColumn].filter((c) => c !== undefined),
            byColumn,
            consumed,
          ),
        );
      }
      for (const pair of spec.numberedPairs ?? []) {
        fields.push(...fieldsForColumns([pair.noColumn, pair.yesColumn], byColumn, consumed));
      }
      if (spec.numberedSpecifyColumns) {
        fields.push(...fieldsForColumns(spec.numberedSpecifyColumns, byColumn, consumed));
      }
      if (fields.length > 0) sections.push({ spec, fields });
    }
  }

  return {
    kind: 'fields',
    sections,
    unmapped: record.fields.filter((field) => !consumed.has(field.column)),
  };
}

function groupTimeRowRecord(record: MaternityAssessmentDto): GroupedTimeRowRecord {
  const layout = timeRowLayoutFor(record.formKey);
  const byColumn = new Map(record.fields.map((field) => [field.column, field]));
  const consumed = new Set<string>();

  let dateField: MaternityAssessmentField | null = null;
  const rows: GroupedTimeRow[] = [];
  const footerFields: MaternityAssessmentField[] = [];

  if (layout) {
    if (layout.dateColumn) {
      dateField = byColumn.get(layout.dateColumn) ?? null;
      if (dateField) consumed.add(layout.dateColumn);
    }
    layout.rows.forEach((spec, i) => {
      const timeField = byColumn.get(spec.timeColumn) ?? null;
      const staffField = byColumn.get(spec.staffColumn) ?? null;
      const subjectFields = fieldsForColumns(spec.subjectColumns, byColumn, consumed);
      const activityFields = fieldsForColumns(spec.activityColumns, byColumn, consumed);
      if (timeField) consumed.add(spec.timeColumn);
      if (staffField) consumed.add(spec.staffColumn);
      rows.push({
        spec,
        index: i + 1,
        timeField,
        staffField,
        subjectFields,
        activityFields,
        hasContent:
          timeField !== null ||
          staffField !== null ||
          subjectFields.length > 0 ||
          activityFields.length > 0,
      });
    });
    footerFields.push(...fieldsForColumns(layout.footerColumns, byColumn, consumed));
  }

  return {
    kind: 'time-rows',
    subjectTitle: layout?.subjectTitle ?? 'ปรึกษาและสภาพที่พบว่า',
    activityTitle: layout?.activityTitle ?? 'กิจกรรมพยาบาลและการประเมินผล',
    dateField,
    rows,
    footerFields,
    unmapped: record.fields.filter((field) => !consumed.has(field.column)),
  };
}

export function groupAssessmentRecord(record: MaternityAssessmentDto): GroupedAssessment {
  return timeRowLayoutFor(record.formKey) ? groupTimeRowRecord(record) : groupFieldsRecord(record);
}
