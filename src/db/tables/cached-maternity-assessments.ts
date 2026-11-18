// cached_maternity_assessments — one row per HOSxP maternity assessment form
// instance (the three [LR] nursing forms: แรกรับ / ระยะคลอด / หลังคลอด).
//
// A HOSxP assessment row is positional (asm_text12 = "BP", asm_chk7 = a
// checkbox). The app resolves every column to its Thai label from
// `assessment_items` BEFORE it lands here, so `fields_json` holds
// {column, label, component, dataType, value} pairs — the cache and the UI
// never need a hardcoded field list, and a site that customised its form
// still renders its own labels.
//
// Name-bearing columns (asm_lk*, user_login — the recording nurse, and at
// some sites the patient) are AES-256-GCM encrypted before they are written;
// `fields_json` marks those entries with `encrypted: true` so the read
// boundary knows to decrypt them.
import type { TableDefinition } from '../table-definition';

export const cachedMaternityAssessmentsTable: TableDefinition = {
  name: 'cached_maternity_assessments',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    // Nullable: an assessment row can outlive the admission row the patient
    // cache still holds (a form recorded for an admission that was never
    // synced). `an` is the stable join key for those rows.
    {
      name: 'patient_id',
      type: 'uuid',
      nullable: true,
      references: { table: 'cached_patients', column: 'id' },
    },
    { name: 'an', type: 'string', maxLength: 32 },
    { name: 'hn', type: 'string', maxLength: 32, nullable: true },

    { name: 'source_system', type: 'string', maxLength: 16 },
    // "<table>:<row id>" — unique per hospital so a re-pull upserts instead
    // of duplicating.
    { name: 'source_pk', type: 'string', maxLength: 160 },

    // App key of the form ('first_pregnant' | 'birth_period' | 'after_birth').
    { name: 'form_key', type: 'string', maxLength: 32 },
    { name: 'form_table', type: 'string', maxLength: 64 },
    { name: 'form_name', type: 'string', maxLength: 250, nullable: true },

    // When the form was recorded (HOSxP assessment_head_datetime).
    { name: 'recorded_at', type: 'datetime' },
    // The form's own clinical date (asm_date*) — the day the nurse wrote it.
    { name: 'recorded_date', type: 'string', maxLength: 10, nullable: true },
    // HOSxP login of the recorder (assessment_head_staff) — an account name,
    // not a person's name, so it needs no encryption.
    { name: 'entry_staff', type: 'string', maxLength: 150, nullable: true },

    // Labelled fields of the form: {column, label, component, dataType,
    // value, encrypted}[].
    { name: 'fields_json', type: 'json' },

    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'uniq_cma_source',
      columns: ['hospital_id', 'source_system', 'source_pk'],
      unique: true,
    },
    { name: 'idx_cma_an', columns: ['an', 'recorded_at'], unique: false },
    { name: 'idx_cma_patient', columns: ['patient_id', 'recorded_at'], unique: false },
    { name: 'idx_cma_hospital_form', columns: ['hospital_id', 'form_key'], unique: false },
  ],
};
