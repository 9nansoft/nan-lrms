import { describe, it, expect } from 'vitest';
import {
  MATERNITY_WARDS, WARD_BEDS_INVENTORY, WARD_BEDS_OCCUPANCY,
  PATIENT_PARTOGRAPH_BY_AN, PATIENT_VITAL_SIGNS_BY_AN,
  PATIENT_LABOUR_BY_AN, PATIENT_PREGNANCY_BY_AN, PATIENT_LABOR_BY_AN,
  PATIENT_LABOUR_MED_BY_AN, PATIENT_STAGE_MED_BY_AN,
  PATIENT_COMPLICATIONS_BY_LABOUR_ID, PATIENT_INFANTS_BY_AN,
  BED_MOVE_REASONS, DRUG_LOOKUP, LABOUR_COMPLICATION_LOOKUP,
  DCH_TYPE_LOOKUP, DCH_STTS_LOOKUP,
} from '@/config/hosxp-queries';

const ALL: Array<[string, { postgresql: string; mysql: string }]> = [
  ['MATERNITY_WARDS', MATERNITY_WARDS],
  ['WARD_BEDS_INVENTORY', WARD_BEDS_INVENTORY],
  ['WARD_BEDS_OCCUPANCY', WARD_BEDS_OCCUPANCY],
  ['PATIENT_PARTOGRAPH_BY_AN', PATIENT_PARTOGRAPH_BY_AN],
  ['PATIENT_VITAL_SIGNS_BY_AN', PATIENT_VITAL_SIGNS_BY_AN],
  ['PATIENT_LABOUR_BY_AN', PATIENT_LABOUR_BY_AN],
  ['PATIENT_PREGNANCY_BY_AN', PATIENT_PREGNANCY_BY_AN],
  ['PATIENT_LABOR_BY_AN', PATIENT_LABOR_BY_AN],
  ['PATIENT_LABOUR_MED_BY_AN', PATIENT_LABOUR_MED_BY_AN],
  ['PATIENT_STAGE_MED_BY_AN', PATIENT_STAGE_MED_BY_AN],
  ['PATIENT_COMPLICATIONS_BY_LABOUR_ID', PATIENT_COMPLICATIONS_BY_LABOUR_ID],
  ['PATIENT_INFANTS_BY_AN', PATIENT_INFANTS_BY_AN],
  ['BED_MOVE_REASONS', BED_MOVE_REASONS],
  ['DRUG_LOOKUP', DRUG_LOOKUP],
  ['LABOUR_COMPLICATION_LOOKUP', LABOUR_COMPLICATION_LOOKUP],
  ['DCH_TYPE_LOOKUP', DCH_TYPE_LOOKUP],
  ['DCH_STTS_LOOKUP', DCH_STTS_LOOKUP],
];

// BMS `/api/sql` accepts ONLY Pascal-style `:name` placeholders. `?` and
// `$N` styles are silently passed through to the underlying DB and produce
// 42000 syntax errors (verified live). These tests fail-fast on regression.

const PARAMETERIZED = new Set([
  'WARD_BEDS_INVENTORY',         // :ward
  'WARD_BEDS_OCCUPANCY',         // :ward
  'PATIENT_PARTOGRAPH_BY_AN',    // :an
  'PATIENT_VITAL_SIGNS_BY_AN',   // :an
  'PATIENT_LABOUR_BY_AN',        // :an
  'PATIENT_PREGNANCY_BY_AN',     // :an
  'PATIENT_LABOR_BY_AN',         // :an
  'PATIENT_LABOUR_MED_BY_AN',    // :an
  'PATIENT_STAGE_MED_BY_AN',     // :an
  'PATIENT_COMPLICATIONS_BY_LABOUR_ID', // :ipt_labour_id
  'PATIENT_INFANTS_BY_AN',       // :an
  'DRUG_LOOKUP',                 // :q
]);

describe('maternity SQL templates', () => {
  describe.each(ALL)('%s', (name, t) => {
    it('has both postgresql and mysql variants', () => {
      expect(t.postgresql).toBeTruthy();
      expect(t.mysql).toBeTruthy();
    });

    it('uses ONLY Pascal :name placeholders (NEVER ? or $N — BMS rejects both)', () => {
      // Reject MySQL-style positional placeholders: ? in placeholder context.
      // Allows ? inside string literals (none of our queries have those).
      const placeholderQ = /(?:[(=,\s])\?(?:[)\s,]|$)/;
      expect(t.postgresql).not.toMatch(placeholderQ);
      expect(t.mysql).not.toMatch(placeholderQ);
      // Reject Postgres-style $N placeholders.
      expect(t.postgresql).not.toMatch(/\$\d/);
      expect(t.mysql).not.toMatch(/\$\d/);
    });

    if (PARAMETERIZED.has(name)) {
      it('parameterized template contains at least one :name placeholder', () => {
        // Pascal :name placeholder pattern: colon + identifier.
        expect(t.postgresql).toMatch(/:\w+/);
        expect(t.mysql).toMatch(/:\w+/);
      });
    }

    it('uses single quotes for string literals (no double-quoted strings)', () => {
      expect(t.postgresql).not.toMatch(/"[YN]"/);
      expect(t.mysql).not.toMatch(/"[YN]"/);
    });
    it('avoids non-portable functions', () => {
      const banned = /\b(CURDATE|NOW|FETCH\s+FIRST|TOP\s+\d)\b/i;
      expect(t.postgresql).not.toMatch(banned);
      expect(t.mysql).not.toMatch(banned);
    });
    it('avoids INTERVAL date arithmetic', () => {
      expect(t.postgresql).not.toMatch(/\bINTERVAL\s+\d/i);
      expect(t.mysql).not.toMatch(/\bINTERVAL\s+\d/i);
    });
    it('avoids backticks', () => {
      expect(t.postgresql).not.toMatch(/`/);
      expect(t.mysql).not.toMatch(/`/);
    });
  });
});
