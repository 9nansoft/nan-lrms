// T028: cpd_scores table definition
import type { TableDefinition } from '../table-definition';

export const cpdScoresTable: TableDefinition = {
  name: 'cpd_scores',
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    {
      name: 'patient_id',
      type: 'uuid',
      references: { table: 'cached_patients', column: 'id' },
    },
    { name: 'score', type: 'decimal' },
    { name: 'risk_level', type: 'string', maxLength: 10 },
    { name: 'recommendation', type: 'string', maxLength: 500, nullable: true },
    { name: 'factor_gravida', type: 'integer', nullable: true },
    // factor_anc_count and factor_ga_weeks are DECIMAL because their
    // evaluators in src/config/risk-levels.ts return 1.5 — Postgres rejects
    // a numeric literal into INTEGER (SQLite is loose, so the bug only
    // surfaced under pglite/postgres). See test
    // tests/integration/cpd-persist-decimal-factors.test.ts.
    { name: 'factor_anc_count', type: 'decimal', nullable: true },
    { name: 'factor_ga_weeks', type: 'decimal', nullable: true },
    { name: 'factor_height_cm', type: 'decimal', nullable: true },
    { name: 'factor_weight_diff', type: 'decimal', nullable: true },
    { name: 'factor_fundal_ht', type: 'decimal', nullable: true },
    { name: 'factor_us_weight', type: 'decimal', nullable: true },
    { name: 'factor_hematocrit', type: 'decimal', nullable: true },
    { name: 'missing_factors', type: 'string[]', nullable: true },
    { name: 'calculated_at', type: 'datetime' },
    { name: 'created_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_cpd_patient_calc', columns: ['patient_id', 'calculated_at'] },
    { name: 'idx_cpd_risk_level', columns: ['risk_level'] },
  ],
};
