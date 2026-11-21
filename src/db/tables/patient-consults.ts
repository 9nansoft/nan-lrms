// patient_consults — one consult request to a doctor, recorded on the
// patient's page.
//
// The DOCTORS live in `hospital_consult_doctors` (the admin-managed contact
// list of each hospital). This table records the CONSULT itself: who was
// asked, why, when, and what came back.
//
// Two decisions are baked in:
//   - The doctor's name, position and CID are SNAPSHOTTED here. The contact
//     list changes (a doctor leaves the roster); the record must still say
//     who was consulted on that day.
//   - `doctor_id` carries NO foreign key for the same reason — deleting a
//     doctor from the contact list must not fail because an old consult
//     mentions them.
//
// This is clinical data of the patient: it is read and written through the
// same patient-visibility scope as every other patient resource.
import type { TableDefinition } from '../table-definition';

export const patientConsultsTable: TableDefinition = {
  name: 'patient_consults',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'hospital_id',
      type: 'uuid',
      references: { table: 'hospitals', column: 'id' },
    },
    // Nullable: an admission row can be wiped before the consult record is.
    // `an` is the stable join key for those rows.
    {
      name: 'patient_id',
      type: 'uuid',
      nullable: true,
      references: { table: 'cached_patients', column: 'id' },
    },
    { name: 'an', type: 'string', maxLength: 32 },
    { name: 'journey_id', type: 'uuid', nullable: true },

    // The doctor who was consulted (a snapshot — see the header).
    { name: 'doctor_id', type: 'uuid', nullable: true },
    { name: 'doctor_cid', type: 'string', maxLength: 13 },
    { name: 'doctor_name', type: 'string', maxLength: 255 },
    { name: 'doctor_position', type: 'string', maxLength: 255, nullable: true },
    { name: 'doctor_phone', type: 'string', maxLength: 50, nullable: true },

    // Why the consult was asked for, and what came back.
    { name: 'reason', type: 'string', maxLength: 500 },
    { name: 'status', type: 'string', maxLength: 20, defaultValue: 'REQUESTED' },
    { name: 'advice', type: 'string', maxLength: 1000, nullable: true },

    // INTERNAL = a doctor of the patient's own hospital (the classic flow).
    // HUB = the question goes UP to the provincial hub hospital's registered
    // OB-GYN team (`target_hospital_id`); answering is authorized by the
    // actor's BMS session CID matching `doctor_cid` (or a clinician of the
    // target hospital), so no users-table join is involved.
    { name: 'consult_scope', type: 'string', maxLength: 20, defaultValue: 'INTERNAL' },
    {
      name: 'target_hospital_id',
      type: 'uuid',
      nullable: true,
      references: { table: 'hospitals', column: 'id' },
    },
    { name: 'urgency_level', type: 'string', maxLength: 20, defaultValue: 'ROUTINE' },
    { name: 'answered_by_name', type: 'string', maxLength: 255, nullable: true },

    // Who asked for it.
    { name: 'requested_by_cid', type: 'string', maxLength: 13, nullable: true },
    { name: 'requested_by_name', type: 'string', maxLength: 255, nullable: true },

    { name: 'consulted_at', type: 'datetime', nullable: true },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_pc_hospital_an', columns: ['hospital_id', 'an'] },
    { name: 'idx_pc_patient', columns: ['patient_id'] },
    { name: 'idx_pc_hospital_status', columns: ['hospital_id', 'status'] },
    { name: 'idx_pc_target_status', columns: ['target_hospital_id', 'status'] },
  ],
};
