// T024: hospitals table definition
import type { TableDefinition } from '../table-definition';

export const hospitalsTable: TableDefinition = {
  name: 'hospitals',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'hcode', type: 'string', maxLength: 5, unique: true },
    { name: 'name', type: 'string', maxLength: 255 },
    { name: 'level', type: 'string', maxLength: 5 },
    // service_type classifies the maternity role: PROVINCIAL_HUB /
    // DISTRICT_WITH_MATERNITY / DISTRICT_NO_MATERNITY. Nullable so legacy
    // rows roll forward; new hospitals default via the admin picker.
    { name: 'service_type', type: 'string', maxLength: 32, nullable: true },
    { name: 'province_code', type: 'string', maxLength: 2, nullable: true },
    { name: 'district_code', type: 'string', maxLength: 4, nullable: true },
    { name: 'lat', type: 'decimal', nullable: true },
    { name: 'lon', type: 'decimal', nullable: true },
    { name: 'is_active', type: 'boolean', defaultValue: true },
    { name: 'last_sync_at', type: 'datetime', nullable: true },
    { name: 'connection_status', type: 'string', maxLength: 10, defaultValue: 'UNKNOWN' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_hospitals_hcode', columns: ['hcode'], unique: true },
  ],
};
