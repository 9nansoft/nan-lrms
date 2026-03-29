import type { TableDefinition } from '../table-definition';

export const cachedNewbornsTable: TableDefinition = {
  name: 'cached_newborns',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'journey_id', type: 'uuid', references: { table: 'maternal_journeys', column: 'id' } },
    { name: 'infant_number', type: 'integer' },
    { name: 'sex', type: 'string', maxLength: 5, nullable: true },
    { name: 'birth_weight_g', type: 'integer', nullable: true },
    { name: 'body_length_cm', type: 'decimal', nullable: true },
    { name: 'head_circum_cm', type: 'decimal', nullable: true },
    { name: 'temperature', type: 'decimal', nullable: true },
    { name: 'heart_rate', type: 'integer', nullable: true },
    { name: 'respiratory_rate', type: 'integer', nullable: true },
    { name: 'apgar_1min', type: 'integer', nullable: true },
    { name: 'apgar_5min', type: 'integer', nullable: true },
    { name: 'apgar_10min', type: 'integer', nullable: true },
    { name: 'resuscitation', type: 'json', nullable: true },
    { name: 'vaccinations', type: 'json', nullable: true },
    { name: 'infant_icd10', type: 'string', maxLength: 20, nullable: true },
    { name: 'infant_hn', type: 'string', maxLength: 20, nullable: true },
    { name: 'infant_an', type: 'string', maxLength: 20, nullable: true },
    { name: 'discharge_status', type: 'string', maxLength: 20, nullable: true },
    { name: 'born_at', type: 'datetime' },
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cn_journey_infant', columns: ['journey_id', 'infant_number'], unique: true },
    { name: 'idx_cn_journey_id', columns: ['journey_id'] },
  ],
};
