// cached_assessment_form_metadata — the LABEL CACHE of the HOSxP maternity
// assessment forms, per hospital.
//
// A HOSxP assessment row is positional (`asm_text12` = "BP"). The meaning of
// every column lives in `assessment_form` / `assessment_items`, and those
// tables change only when the SITE changes its form. Re-reading them on
// every sync cycle is wasted work — so the pull keeps them here.
//
// One row per FORM VERSION, not per form: a site can keep an older version
// of a form, and the rows recorded under that version are labelled with
// THAT version's items. The unique index is therefore
// (hospital_id, form_table, form_id), and a re-read UPDATES a version in
// place instead of accumulating duplicates.
//
// `items_json` holds the `assessment_items` rows of that form version as
// {assessment_form_id, assessment_items_column, assessment_items_note,
// assessment_component_name, assessment_data_type} objects — the same shape
// the sync already uses, so nothing has to be translated on the way out.
import type { TableDefinition } from '../table-definition';

export const cachedAssessmentFormMetadataTable: TableDefinition = {
  name: 'cached_assessment_form_metadata',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    // HOSxP table the form version belongs to (asm_lr_record_after_birth_nan).
    { name: 'form_table', type: 'string', maxLength: 64 },
    // HOSxP's id of THAT version of the form.
    { name: 'form_id', type: 'integer' },
    // The form's Thai name, as HOSxP knows it.
    { name: 'form_name', type: 'string', maxLength: 250, nullable: true },
    // The column labels of this form version.
    { name: 'items_json', type: 'json' },
    // When the labels were last read from HOSxP (the freshness clock).
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'uniq_cafm_hospital_form_version',
      columns: ['hospital_id', 'form_table', 'form_id'],
      unique: true,
    },
    { name: 'idx_cafm_hospital', columns: ['hospital_id'], unique: false },
  ],
};
