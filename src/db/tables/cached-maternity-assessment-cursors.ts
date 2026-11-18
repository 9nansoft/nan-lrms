// cached_maternity_assessment_cursors — the pull position of each maternity
// assessment form, per hospital.
//
// One row per (hospital, HOSxP form table): the primary key of the last row
// the sync pulled for that form. The next pull asks HOSxP for everything
// ABOVE that key, so a dense form (hundreds of rows on one day) cannot stall
// the pull — a date-based cutoff would keep re-reading the same oldest page
// forever and the newest rows would never arrive.
//
// The cursor is advanced by the PULL, not by the cache: a row that fails to
// store must not hold the form back, otherwise one bad row blocks every
// later row of that form forever.
import type { TableDefinition } from '../table-definition';

export const cachedMaternityAssessmentCursorsTable: TableDefinition = {
  name: 'cached_maternity_assessment_cursors',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    // HOSxP table the cursor belongs to (asm_lr_record_after_birth_nan, ...).
    { name: 'form_table', type: 'string', maxLength: 64 },
    // The last primary key pulled for this form, as text (HOSxP pks are
    // integers; text keeps the value dialect-free).
    { name: 'cursor_pk', type: 'string', maxLength: 64 },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'uniq_cmac_hospital_form',
      columns: ['hospital_id', 'form_table'],
      unique: true,
    },
  ],
};
