import type { TableDefinition } from '../table-definition';

export const cachedReferralsTable: TableDefinition = {
  name: 'cached_referrals',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'journey_id', type: 'uuid', references: { table: 'maternal_journeys', column: 'id' } },
    { name: 'refer_number', type: 'string', maxLength: 50, nullable: true },
    { name: 'from_hospital_id', type: 'uuid', references: { table: 'hospitals', column: 'id' } },
    { name: 'to_hospital_id', type: 'uuid', references: { table: 'hospitals', column: 'id' } },
    { name: 'status', type: 'string', maxLength: 20, defaultValue: 'INITIATED' },
    { name: 'reason', type: 'text' },
    { name: 'diagnosis_code', type: 'string', maxLength: 20, nullable: true },
    { name: 'urgency_level', type: 'string', maxLength: 20, defaultValue: 'ROUTINE' },
    { name: 'rejection_reason', type: 'text', nullable: true },
    { name: 'suggested_alternative_id', type: 'uuid', nullable: true, references: { table: 'hospitals', column: 'id' } },
    { name: 'transport_mode', type: 'string', maxLength: 50, nullable: true },
    { name: 'initiated_at', type: 'datetime' },
    { name: 'accepted_at', type: 'datetime', nullable: true },
    { name: 'departed_at', type: 'datetime', nullable: true },
    { name: 'arrived_at', type: 'datetime', nullable: true },
    { name: 'rejected_at', type: 'datetime', nullable: true },
    { name: 'initiated_by', type: 'uuid', nullable: true, references: { table: 'users', column: 'id' } },
    { name: 'accepted_by', type: 'uuid', nullable: true, references: { table: 'users', column: 'id' } },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cr_journey_id', columns: ['journey_id'] },
    { name: 'idx_cr_from_status', columns: ['from_hospital_id', 'status'] },
    { name: 'idx_cr_to_status', columns: ['to_hospital_id', 'status'] },
    { name: 'idx_cr_status', columns: ['status'] },
  ],
};
