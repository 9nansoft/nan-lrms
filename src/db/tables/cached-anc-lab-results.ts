import type { TableDefinition } from '../table-definition';

/**
 * Every ANC laboratory result HOSxP holds for a pregnancy, classified or not.
 *
 * PDPA: `raw_result`, `normal_reference`, `abnormal_flag` and
 * `anc_result_normal_raw` are always AES-256-GCM ciphertext, because HOSxP's
 * flags and reference text can reveal a result. For sensitive tests
 * (see `sensitive` in src/config/anc-lab-canon.ts) `numeric_value`,
 * `normalized_value` and `interpretation` stay NULL so the outcome never sits
 * in a plaintext column; the read service re-derives them after decrypting.
 * `content_hash` is keyed (HMAC) because result domains are tiny enough that a
 * plain hash could be reversed by guessing.
 *
 * Free-text HOSxP fields use `text`: lab names and results vary by site and a
 * width overflow must never abort a hospital's bundle.
 */
export const cachedAncLabResultsTable: TableDefinition = {
  name: 'cached_anc_lab_results',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'journey_id', type: 'uuid', references: { table: 'maternal_journeys', column: 'id' } },
    { name: 'hospital_id', type: 'uuid', references: { table: 'hospitals', column: 'id' } },
    { name: 'source', type: 'string', maxLength: 12 }, // anc_lab | lab_order | person_anc
    // HOSxP row identity, unique per hospital (ids repeat across sites).
    { name: 'source_key', type: 'string', maxLength: 160 },
    { name: 'result_date', type: 'datetime', nullable: true },
    { name: 'ga_weeks', type: 'integer', nullable: true },
    // NULL = unclassified; the row stays visible by its original names.
    { name: 'canonical_test', type: 'string', maxLength: 30, nullable: true },
    // Why a name-matched row was left unclassified (e.g. value_shape_mismatch).
    { name: 'classification_note', type: 'string', maxLength: 30, nullable: true },
    { name: 'anc_lab_name', type: 'text', nullable: true },
    { name: 'lab_items_name', type: 'text', nullable: true },
    { name: 'lab_items_code', type: 'text', nullable: true },
    { name: 'raw_result', type: 'text', nullable: true }, // encrypted; NULL when concealed
    { name: 'numeric_value', type: 'decimal', nullable: true },
    { name: 'normalized_value', type: 'string', maxLength: 10, nullable: true }, // e.g. blood group
    { name: 'interpretation', type: 'string', maxLength: 12, nullable: true },
    { name: 'unit', type: 'text', nullable: true },
    { name: 'normal_reference', type: 'text', nullable: true }, // encrypted
    { name: 'abnormal_flag', type: 'text', nullable: true }, // encrypted
    // person_anc_lab.lab_result_normal: meaning unconfirmed, carried verbatim
    // (encrypted).
    { name: 'anc_result_normal_raw', type: 'text', nullable: true },
    { name: 'concealed', type: 'boolean', defaultValue: false },
    { name: 'content_hash', type: 'string', maxLength: 64 },
    { name: 'synced_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'uq_calr_hospital_source_key', columns: ['hospital_id', 'source_key'], unique: true },
    { name: 'idx_calr_journey_date', columns: ['journey_id', 'result_date'] },
  ],
};
