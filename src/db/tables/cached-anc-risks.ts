import type { TableDefinition } from '../table-definition';

export const cachedAncRisksTable: TableDefinition = {
  name: 'cached_anc_risks',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'journey_id', type: 'uuid', references: { table: 'maternal_journeys', column: 'id' } },
    { name: 'risk_level', type: 'string', maxLength: 10 },
    { name: 'triggered_rules', type: 'json' },
    { name: 'risk_factors', type: 'json' },
    { name: 'recommended_facility', type: 'string', maxLength: 100, nullable: true },
    { name: 'recommended_provider', type: 'string', maxLength: 100, nullable: true },
    { name: 'screened_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_car_journey_screened', columns: ['journey_id', 'screened_at'] },
    { name: 'idx_car_risk_level', columns: ['risk_level'] },
  ],
};
