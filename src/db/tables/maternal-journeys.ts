// maternal_journeys — lifetime pregnancy record (one row per pregnancy per CID).
// Source of truth for care_stage, ancRiskLevel, current_hospital_id.
// Linked to cached_patients via cached_patients.journey_id. See ./README.md.
import type { TableDefinition } from '../table-definition';

export const maternalJourneysTable: TableDefinition = {
  name: 'maternal_journeys',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'hospital_id', type: 'uuid', references: { table: 'hospitals', column: 'id' } },
    { name: 'current_hospital_id', type: 'uuid', references: { table: 'hospitals', column: 'id' } },
    { name: 'hn', type: 'string', maxLength: 20 },
    { name: 'person_anc_id', type: 'integer', nullable: true },
    { name: 'name', type: 'string', maxLength: 255 },
    { name: 'cid', type: 'string', maxLength: 255 },
    { name: 'cid_hash', type: 'string', maxLength: 64 },
    { name: 'age', type: 'integer' },
    { name: 'gravida', type: 'integer' },
    { name: 'para', type: 'integer', defaultValue: 0 },
    { name: 'lmp', type: 'datetime', nullable: true },
    { name: 'edc', type: 'datetime', nullable: true },
    { name: 'care_stage', type: 'string', maxLength: 20, defaultValue: 'PREGNANCY' },
    { name: 'anc_risk_level', type: 'string', maxLength: 10, defaultValue: 'LOW' },
    { name: 'anc_visit_count', type: 'integer', defaultValue: 0 },
    { name: 'last_anc_date', type: 'datetime', nullable: true },
    { name: 'ga_weeks', type: 'integer', nullable: true },
    { name: 'changwat_code', type: 'string', maxLength: 2, nullable: true },
    { name: 'amphur_code', type: 'string', maxLength: 2, nullable: true },
    { name: 'tambon_code', type: 'string', maxLength: 2, nullable: true },
    // WHO 2016 ANC journey-level data (L2). All optional — populated opportunistically
    // by HOSxP sync / webhook. Results are short codes (POS/NEG/PENDING/UNKNOWN).
    { name: 'blood_group', type: 'string', maxLength: 2, nullable: true },        // A / B / AB / O
    { name: 'rh_factor', type: 'string', maxLength: 3, nullable: true },          // POS / NEG
    { name: 'hbsag_result', type: 'string', maxLength: 10, nullable: true },      // POS / NEG / PENDING
    { name: 'vdrl_result', type: 'string', maxLength: 10, nullable: true },
    { name: 'hiv_result', type: 'string', maxLength: 10, nullable: true },
    { name: 'ogtt_result', type: 'string', maxLength: 10, nullable: true },       // NORMAL / ABNORMAL / PENDING
    // GPAL / GTPAL obstetric history.
    { name: 'term_births', type: 'integer', nullable: true },
    { name: 'preterm_births', type: 'integer', nullable: true },
    { name: 'abortions', type: 'integer', nullable: true },
    { name: 'living_children', type: 'integer', nullable: true },
    // Past medical history free-text summary (HT / DM / thyroid / cardiac / thalassemia / epilepsy).
    { name: 'past_medical_history', type: 'text', nullable: true },
    { name: 'registered_at', type: 'datetime' },
    { name: 'stage_changed_at', type: 'datetime' },
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_mj_hospital_hn', columns: ['hospital_id', 'hn'] },
    { name: 'idx_mj_care_stage', columns: ['care_stage'] },
    { name: 'idx_mj_anc_risk_level', columns: ['anc_risk_level'] },
    { name: 'idx_mj_cid_hash', columns: ['cid_hash'] },
    { name: 'idx_mj_current_hospital', columns: ['current_hospital_id'] },
    { name: 'idx_mj_location', columns: ['changwat_code', 'amphur_code', 'tambon_code'] },
    { name: 'idx_mj_hospital_stage', columns: ['current_hospital_id', 'care_stage'] },
  ],
};
