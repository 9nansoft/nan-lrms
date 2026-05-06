// T024: hospitals table definition
import type { TableDefinition } from '../table-definition';

export const hospitalsTable: TableDefinition = {
  name: 'hospitals',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'hcode', type: 'string', maxLength: 5, unique: true },
    { name: 'name', type: 'string', maxLength: 255 },
    // 10 chars accommodates SAP short codes like 'P+', 'A+', 'S_C' alongside
    // the legacy 3-char values ('A_S', 'M1', etc). Existing PG installs
    // need a one-shot ALTER COLUMN since schema-sync only ADDs columns.
    { name: 'level', type: 'string', maxLength: 10 },
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
    // SAP มติ 3/2568 sometimes assigns "S เงื่อนไข" with specific
    // development requirements per hospital (โครงสร้างพื้นฐาน /
    // ประสิทธิภาพบริการ / บุคลากร). Stored as Thai free-text so admins
    // can edit it in /admin without touching the enum.
    { name: 'development_condition', type: 'text', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_hospitals_hcode', columns: ['hcode'], unique: true },
  ],
};
