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
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cav_journey_date', columns: ['journey_id', 'visit_date'], unique: true },
    { name: 'idx_cav_journey_id', columns: ['journey_id'] },
  ],
};
