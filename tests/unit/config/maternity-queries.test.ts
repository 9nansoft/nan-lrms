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

describe('maternity SQL templates', () => {
  describe.each(ALL)('%s', (_name, t) => {
    it('has both postgresql and mysql variants', () => {
      expect(t.postgresql).toBeTruthy();
      expect(t.mysql).toBeTruthy();
    });
    it('mysql variant has no $N placeholders', () => {
      expect(t.mysql).not.toMatch(/\$\d/);
    });
    it('postgresql variant has no raw ? placeholders', () => {
      // Allow ? in column comments etc., but disallow as positional placeholder
      // (i.e. ? not adjacent to alphanumerics)
      expect(t.postgresql).not.toMatch(/\(\s*\?\s*\)|=\s*\?|\s\?\s|,\s*\?/);
    });
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
