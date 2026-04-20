// Regression: cpd_scores.factor_anc_count + factor_ga_weeks must be DECIMAL.
// The evaluators in src/config/risk-levels.ts return 1.5 for high-risk
// values; if the columns are INTEGER, pglite/Postgres rejects the INSERT
// with "invalid input syntax for type integer: 1.5". SQLite was loose
// enough that the bug only surfaced under pglite.
//
// This test exercises calculateAndStoreCpdScores against pglite with a
// patient whose ancCount=2 and gaWeeks=42 (both 1.5-returning) and
// asserts the row landed with the decimal values intact.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createPgliteDb } from '../helpers/createPgliteDb';
import { calculateAndStoreCpdScores } from '@/services/sync/cpd-persist';
import type { PgliteAdapter } from '@/db/pglite-adapter';

let db: PgliteAdapter;

const sseManagerStub = {
  broadcast: vi.fn(),
};

beforeEach(async () => {
  db = await createPgliteDb();
});

afterEach(async () => {
  await db.close();
});

describe('cpd-persist: decimal factor columns', () => {
  it('persists 1.5 factor scores without coercion or error', async () => {
    // Seed minimal hospital + cached_patient with high-risk values
    const hospitalId = uuidv4();
    await db.execute(
      `INSERT INTO hospitals (
        id, hcode, name, level, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [hospitalId, '99999', 'Test Hospital', 'A', true, new Date().toISOString(), new Date().toISOString()],
    );
    const patientId = uuidv4();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients (
        id, hospital_id, hn, an, name, age, admit_date, labor_status,
        gravida, anc_count, ga_weeks, height_cm, weight_diff_kg,
        fundal_height_cm, us_weight_g, hematocrit_pct,
        synced_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId, hospitalId, 'HN1', 'AN1', 'enc-name', 28, now, 'ACTIVE',
        // high-risk values that all hit 1.5-returning branches
        1,    // gravida=1 -> 2
        2,    // ancCount=2 -> 1.5  (INT column would reject)
        42,   // gaWeeks=42 -> 1.5  (INT column would reject)
        148,  // heightCm=148 -> 2
        21,   // weightDiffKg=21 -> 2
        38,   // fundalHeightCm=38 -> 2
        4200, // usWeightG=4200 -> 2
        28,   // hematocritPct=28 -> 1.5
        now, now, now,
      ],
    );

    // This is the call that previously crashed under pglite/Postgres
    await expect(
      calculateAndStoreCpdScores(db, hospitalId, sseManagerStub as never),
    ).resolves.not.toThrow();

    const rows = await db.query<{
      factor_gravida: number | null;
      factor_anc_count: number | null;
      factor_ga_weeks: number | null;
      factor_height_cm: number | null;
      factor_hematocrit: number | null;
      score: number;
      risk_level: string;
    }>(
      'SELECT factor_gravida, factor_anc_count, factor_ga_weeks, factor_height_cm, factor_hematocrit, score, risk_level FROM cpd_scores WHERE patient_id = ?',
      [patientId],
    );

    expect(rows).toHaveLength(1);
    // The two previously-broken columns must store 1.5 verbatim
    expect(Number(rows[0].factor_anc_count)).toBe(1.5);
    expect(Number(rows[0].factor_ga_weeks)).toBe(1.5);
    // Sanity: the still-DECIMAL hematocrit column too
    expect(Number(rows[0].factor_hematocrit)).toBe(1.5);
    // Total score: 2 + 1.5 + 1.5 + 2 + 2 + 2 + 2 + 1.5 = 14.5 → HIGH
    expect(Number(rows[0].score)).toBe(14.5);
    expect(rows[0].risk_level).toBe('HIGH');
  });
});
