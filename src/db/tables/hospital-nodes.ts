// hospital_nodes — node-hospital configuration.
//
// One row says "node_hospital_id supervises child_hospital_id". A node
// hospital may read the patients of every hospital below it in the tree
// (transitively) without needing a referral. Admin-managed from /admin →
// รพ.โหนด; the tree is read by src/services/visibility-scope.ts.
import type { TableDefinition } from '../table-definition';

export const hospitalNodesTable: TableDefinition = {
  name: 'hospital_nodes',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'node_hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    {
      name: 'child_hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_hn_node', columns: ['node_hospital_id'] },
    { name: 'idx_hn_child', columns: ['child_hospital_id'] },
    {
      name: 'idx_hn_pair',
      columns: ['node_hospital_id', 'child_hospital_id'],
      unique: true,
    },
  ],
};
