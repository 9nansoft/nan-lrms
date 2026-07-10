// Hospital-to-hospital video calls: one row per call attempt, signaling
// audit trail for the Jitsi-based call feature. Caller/callee identity is
// snapshotted inline (same rationale as audit_logs actor columns) so history
// survives user changes. room_id is an unguessable UUID — the only access
// control on the anonymous-join Jitsi server — so rows must never leak to
// non-participants.
import type { TableDefinition } from '../table-definition';

export const videoCallsTable: TableDefinition = {
  name: 'video_calls',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'room_id', type: 'string', maxLength: 64 },
    { name: 'caller_user_id', type: 'string', maxLength: 255 },
    { name: 'caller_name', type: 'string', maxLength: 255 },
    { name: 'caller_hospital_code', type: 'string', maxLength: 9 },
    { name: 'callee_user_id', type: 'string', maxLength: 255 },
    { name: 'callee_name', type: 'string', maxLength: 255 },
    { name: 'callee_hospital_code', type: 'string', maxLength: 9 },
    // ringing → accepted | declined | cancelled | missed; accepted → ended
    { name: 'status', type: 'string', maxLength: 16 },
    { name: 'created_at', type: 'datetime' },
    { name: 'answered_at', type: 'datetime', nullable: true },
    { name: 'ended_at', type: 'datetime', nullable: true },
  ],
  indexes: [
    { name: 'idx_vc_callee_user', columns: ['callee_user_id'] },
    { name: 'idx_vc_caller_user', columns: ['caller_user_id'] },
    { name: 'idx_vc_status', columns: ['status'] },
    { name: 'idx_vc_created_at', columns: ['created_at'] },
  ],
};
