import type { TableDefinition } from '../table-definition';

export const cachedAncVisitsTable: TableDefinition = {
  name: 'cached_anc_visits',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'journey_id', type: 'uuid', references: { table: 'maternal_journeys', column: 'id' } },
    { name: 'visit_date', type: 'datetime' },
    { name: 'visit_number', type: 'integer' },
    { name: 'ga_weeks', type: 'integer', nullable: true },
    { name: 'ga_days', type: 'integer', nullable: true },
    { name: 'fundal_height_cm', type: 'decimal', nullable: true },
    { name: 'weight_kg', type: 'decimal', nullable: true },
    { name: 'bp_systolic', type: 'integer', nullable: true },
    { name: 'bp_diastolic', type: 'integer', nullable: true },
    { name: 'fetal_hr', type: 'integer', nullable: true },
    { name: 'presentation', type: 'string', maxLength: 50, nullable: true },
    { name: 'engagement', type: 'string', maxLength: 50, nullable: true },
    { name: 'pass_quality', type: 'boolean', nullable: true },
    { name: 'provider_code', type: 'string', maxLength: 20, nullable: true },
    // WHO 2016 ANC data elements (L2).
    { name: 'urine_protein', type: 'string', maxLength: 10, nullable: true },  // '-', 'trace', '+', '++', '+++'
    { name: 'urine_glucose', type: 'string', maxLength: 10, nullable: true },
    { name: 'hb_g_dl', type: 'decimal', nullable: true },
    { name: 'hct_pct', type: 'decimal', nullable: true },
    { name: 'tt_dose_no', type: 'integer', nullable: true },                   // tetanus toxoid dose number 0-5
    { name: 'iron_folic_given', type: 'boolean', nullable: true },
    { name: 'calcium_given', type: 'boolean', nullable: true },
    { name: 'danger_signs_json', type: 'json', nullable: true },               // ['bleeding','severe_headache',...]
    { name: 'fetal_movement_ok', type: 'boolean', nullable: true },            // T3 — asks woman if movements felt normal
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cav_journey_date', columns: ['journey_id', 'visit_date'], unique: true },
    { name: 'idx_cav_journey_id', columns: ['journey_id'] },
  ],
};
