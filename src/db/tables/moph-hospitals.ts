// Full MOPH hospital registry — 5-digit hospcodes across all 77 provinces,
// filtered to facility types 5/6/7/11/12/13 (general + regional + community
// + F3/sub-district). Seeded from src/data/thai-geo/hospitals.json.
// This is a LOOKUP table. The operational `hospitals` table holds only the
// facilities the current deployment actively monitors.
import type { TableDefinition } from '../table-definition';

export const mophHospitalsTable: TableDefinition = {
  name: 'moph_hospitals',
  fields: [
    { name: 'hcode', type: 'string', maxLength: 5, primaryKey: true },
    { name: 'name', type: 'string', maxLength: 255 },
    { name: 'hospital_type_id', type: 'integer', nullable: true },
    { name: 'hospital_level_id', type: 'integer', nullable: true },
    { name: 'bed_count', type: 'integer', nullable: true },
    { name: 'province_code', type: 'string', maxLength: 2, nullable: true },
    { name: 'district_code', type: 'string', maxLength: 4, nullable: true },
    { name: 'tambon_code', type: 'string', maxLength: 6, nullable: true },
    { name: 'address', type: 'string', maxLength: 200, nullable: true },
    { name: 'phone', type: 'string', maxLength: 50, nullable: true },
    { name: 'active_status', type: 'string', maxLength: 1, nullable: true },
  ],
  indexes: [
    { name: 'idx_moph_hospitals_province', columns: ['province_code'] },
    { name: 'idx_moph_hospitals_district', columns: ['district_code'] },
  ],
};
