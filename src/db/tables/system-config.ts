// Singleton key/value store for system-wide settings editable from /admin.
// Known keys:
//   active_province_code — 2-digit MOPH code; scopes dashboard/map/sync.
import type { TableDefinition } from '../table-definition';

export const systemConfigTable: TableDefinition = {
  name: 'system_config',
  fields: [
    { name: 'key', type: 'string', maxLength: 100, primaryKey: true },
    { name: 'value', type: 'text', nullable: true },
    { name: 'updated_at', type: 'datetime' },
  ],
};
