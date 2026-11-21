// consult_messages — the message thread of ONE consult request.
//
// A HUB consult used to be a single exchange (one `reason`, one `advice`);
// the two teams now talk in a thread instead — each message lands here,
// bound to the consult, which is bound to the admission's AN, so the
// conversations of one patient never mix with another's.
//
// Two decisions are baked in (the same ones `patient_consults` made):
//   - The sender's name, role and CID are SNAPSHOTTED here. Identity comes
//     from the BMS session at send time; the sender's hospital is a plain
//     FK to `hospitals` (hospitals are stable, people are not).
//   - This is clinical data of the patient: it is read and written through
//     the same patient-visibility scope as every other patient resource.
//
// `message_type` marks the automatic entries the system writes when the
// consult moves on (a status change is announced inside the thread), so the
// thread reads as the complete record of the consult. Only HUB consults
// carry a thread — the INTERNAL flow is a phone call the team records.
import type { TableDefinition } from '../table-definition';

export const consultMessagesTable: TableDefinition = {
  name: 'consult_messages',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    // The consult the message belongs to — the thread's sole key. Deleting a
    // consult deletes its thread with it.
    {
      name: 'consult_id',
      type: 'uuid',
      references: { table: 'patient_consults', column: 'id' },
    },
    // The sender (a snapshot — see the header).
    {
      name: 'sender_hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    { name: 'sender_cid', type: 'string', maxLength: 13 },
    { name: 'sender_name', type: 'string', maxLength: 255 },
    { name: 'sender_role', type: 'string', maxLength: 20, nullable: true },

    // What they said, or (for SYSTEM rows) the automatic status note.
    { name: 'body', type: 'string', maxLength: 2000 },
    { name: 'message_type', type: 'string', maxLength: 20, defaultValue: 'TEXT' },

    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cm_consult_created', columns: ['consult_id', 'created_at'] },
    { name: 'idx_cm_sender_hospital', columns: ['sender_hospital_id'] },
  ],
};
