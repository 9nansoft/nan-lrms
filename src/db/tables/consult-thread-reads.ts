// consult_thread_reads — per-user read receipts for consult threads.
//
// One row per (consult, user): the moment that person last had the thread
// open. The consult lists join against it to compute each viewer's unread
// count — TEXT messages newer than the reader's last visit — so a new
// message announces itself on the row without opening the thread.
//
// The user is a CID snapshot (identity from the session), no FK to a users
// table — the same choice every consult table made. No row means "never
// opened": everything counts.
import type { TableDefinition } from '../table-definition';

export const consultThreadReadsTable: TableDefinition = {
  name: 'consult_thread_reads',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'consult_id',
      type: 'uuid',
      references: { table: 'patient_consults', column: 'id' },
    },
    { name: 'user_cid', type: 'string', maxLength: 13 },
    { name: 'last_read_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_ctr_consult_user', columns: ['consult_id', 'user_cid'], unique: true },
    { name: 'idx_ctr_user', columns: ['user_cid'] },
  ],
};
