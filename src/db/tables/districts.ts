import type { TableDefinition } from '../table-definition';

export const districtsTable: TableDefinition = {
  name: 'districts',
  fields: [
    { name: 'district_code', type: 'string', maxLength: 4, primaryKey: true },
    { name: 'district_name', type: 'string', maxLength: 150 },
    { name: 'province_code', type: 'string', maxLength: 2 },
  ],
  indexes: [
    { name: 'idx_districts_province', columns: ['province_code'] },
  ],
};
