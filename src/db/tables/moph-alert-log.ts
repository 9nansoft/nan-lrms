// MOPH Prompt alert log — the ONE authoritative per-recipient attempt record.
//
// Each row is a single (case × recipient × alert-event) intent/attempt. The
// enqueue path writes status='pending' rows (no LINE I/O); the drain path
// flips them to sent/failed/skipped. The unique index enforces idempotency
// (codex #5): one alert per (case, hospital, recipient, source, severity,
// rule, local calendar-date) per day.
//
// `local_date` is a stored 'YYYY-MM-DD' string (Asia/Bangkok calendar date)
// rather than a generated column — the abstract table type system has no
// generated-column support, and a plain string keeps the dedup index
// deterministic across PGlite (tests) and Postgres (prod).
//
// `rule_id` is NOT NULL default 'none' (not nullable) so the unique index
// behaves deterministically: Postgres treats NULLs as distinct in a unique
// index, which would defeat dedup. HIGH sets the CPD classifier id, EMERGENCY
// sets the acuity rule id; 'none' is the inert fallback.
import type { TableDefinition } from '../table-definition';

export const mophAlertLogTable: TableDefinition = {
  name: 'moph_alert_log',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'case_id', type: 'string', maxLength: 100 },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    { name: 'origin_hcode', type: 'string', maxLength: 10 },
    { name: 'recipient_cid', type: 'string', maxLength: 13 },
    { name: 'recipient_scope', type: 'string', maxLength: 20 },
    { name: 'alert_source', type: 'string', maxLength: 30 },
    { name: 'severity', type: 'string', maxLength: 20 },
    { name: 'rule_id', type: 'string', maxLength: 60, defaultValue: 'none' },
    { name: 'title', type: 'string', maxLength: 200 },
    { name: 'status', type: 'string', maxLength: 20, defaultValue: 'pending' },
    { name: 'message_id', type: 'string', maxLength: 80, nullable: true },
    { name: 'api_status', type: 'string', maxLength: 20, nullable: true },
    { name: 'attempts', type: 'integer', defaultValue: 0 },
    { name: 'last_error', type: 'text', nullable: true },
    { name: 'confirm_url', type: 'string', maxLength: 500, nullable: true },
    { name: 'local_date', type: 'string', maxLength: 10 },
    { name: 'sent_at', type: 'datetime', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    {
      name: 'idx_moph_alert_dedup',
      unique: true,
      columns: [
        'case_id',
        'hospital_id',
        'recipient_cid',
        'alert_source',
        'severity',
        'rule_id',
        'local_date',
      ],
    },
    { name: 'idx_moph_alert_drain', columns: ['hospital_id', 'status', 'created_at'] },
  ],
};
