import type { TableDefinition } from '../table-definition';

export const tambonsTable: TableDefinition = {
  name: 'tambons',
  fields: [
    { name: 'tambon_code', type: 'string', maxLength: 6, primaryKey: true },
    { name: 'tambon_name', type: 'string', maxLength: 150 },
    { name: 'district_code', type: 'string', maxLength: 4 },
  ],
  indexes: [
    { name: 'idx_tambons_district', columns: ['district_code'] },
  ],
};
