import type { TableDefinition } from '../table-definition';

export const provincesTable: TableDefinition = {
  name: 'provinces',
  fields: [
    { name: 'province_code', type: 'string', maxLength: 2, primaryKey: true },
    { name: 'province_name', type: 'string', maxLength: 150 },
  ],
};
