// Recipient-independent MOPH alert events that could not be delivered because
// no eligible recipient existed when the clinical event was produced.
//
// The enqueue path stores one row per event/day. The drain re-resolves the
// current recipient configuration and materializes ordinary moph_alert_log
// rows only while the event is still on the same Bangkok calendar date.
import type { TableDefinition } from '../table-definition';

export const mophAlertEventQueueTable: TableDefinition = {
  name: 'moph_alert_event_queue',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'case_id', type: 'string', maxLength: 100 },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    { name: 'origin_hcode', type: 'string', maxLength: 10 },
    { name: 'hospital_name', type: 'string', maxLength: 255, nullable: true },
    { name: 'province', type: 'string', maxLength: 10, nullable: true },
    { name: 'alert_source', type: 'string', maxLength: 30 },
    { name: 'severity', type: 'string', maxLength: 20 },
    { name: 'rule_id', type: 'string', maxLength: 60, defaultValue: 'none' },
    { name: 'title', type: 'string', maxLength: 200 },
    { name: 'patient_name_enc', type: 'text', nullable: true },
    { name: 'confirm_url', type: 'string', maxLength: 500, nullable: true },
    { name: 'local_date', type: 'string', maxLength: 10 },
    { name: 'status', type: 'string', maxLength: 30, defaultValue: 'awaiting_recipients' },
    { name: 'materialized_at', type: 'datetime', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'idx_moph_alert_event_dedup',
      unique: true,
      columns: [
        'case_id',
        'hospital_id',
        'alert_source',
        'severity',
        'rule_id',
        'local_date',
      ],
    },
    {
      name: 'idx_moph_alert_event_replay',
      columns: ['hospital_id', 'status', 'local_date', 'updated_at'],
    },
  ],
};
