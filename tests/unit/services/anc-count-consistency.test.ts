// One label, one number.
//
// "ANC Registry" is rendered on the province dashboard, the /pregnancies board
// and the /hospitals console. Each surface used to build its own SQL, and the
// hospital console's copy omitted the freshness gates in src/config/anc-freshness.ts
// — so it counted every row ever marked care_stage='PREGNANCY', including women
// who had already delivered or been lost to follow-up. In production that read
// 3162 against the board's 1517.
//
// These tests pin the invariant that makes that class of drift impossible:
// every ANC Registry number in the app counts the SAME cohort.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { getProvinceDashboard, getStageKPIs } from '@/services/dashboard';
import { getAncBoardCounts } from '@/services/journey-list';

describe('ANC Registry count consistency', () => {
  let db: DatabaseAdapter;
  const hospitalId = 'hosp-001';
  const hcode = '10670';

  const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
  const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

  /** One PREGNANCY-stage journey, registered at and currently cared for by the
   *  single seeded hospital. Only the freshness-relevant fields vary. */
  const insertPregnancy = (
    id: string,
    opts: { lastAnc?: string | null; edc?: string | null; gaWeeks?: number | null; risk?: string },
  ) => {
    const now = new Date().toISOString();
    return db.execute(
      `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash,
         age, gravida, para, care_stage, anc_risk_level, anc_visit_count, last_anc_date, edc, ga_weeks,
         registered_at, stage_changed_at, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Test', 'enc_cid', 'cidhash', 25, 1, 0, 'PREGNANCY', ?, 3, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        hospitalId,
        hospitalId,
        `HN-${id}`,
        opts.risk ?? 'LOW',
        opts.lastAnc ?? null,
        opts.edc ?? null,
        opts.gaWeeks ?? null,
        now,
        now,
        now,
        now,
        now,
      ],
    );
  };

  /** A cohort with exactly one woman still being followed and three that the
   *  freshness gates are meant to drop. */
  const seedMixedCohort = async () => {
    await insertPregnancy('g-fresh', { lastAnc: daysAgo(5), edc: daysAhead(30), risk: 'HR3' });
    await insertPregnancy('g-ltfu', { lastAnc: daysAgo(90), edc: daysAhead(30), risk: 'HR3' });
    await insertPregnancy('g-edc-past', { lastAnc: daysAgo(5), edc: daysAgo(40), risk: 'HR3' });
    await insertPregnancy('g-postterm', { lastAnc: daysAgo(5), edc: daysAhead(30), gaWeeks: 60 });
  };

  beforeEach(async () => {
    db = await createTestDb();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, ?, 'รพ.น่าน', 'A_S', TRUE, 'ONLINE', NOW(), NOW())`,
      [hospitalId, hcode],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('per-hospital ancCounts.total drops women outside the freshness gates', async () => {
    await seedMixedCohort();

    const dashboard = await getProvinceDashboard(db);
    const hospital = dashboard.hospitals.find((h) => h.hcode === hcode);

    expect(hospital?.ancCounts.total).toBe(1);
  });

  it('per-hospital ancCounts.hr3 drops women outside the freshness gates', async () => {
    await seedMixedCohort();

    const dashboard = await getProvinceDashboard(db);
    const hospital = dashboard.hospitals.find((h) => h.hcode === hcode);

    expect(hospital?.ancCounts.hr3).toBe(1);
  });

  it('per-hospital ancCounts sum to the province ANC board total', async () => {
    await seedMixedCohort();

    const [dashboard, board] = await Promise.all([getProvinceDashboard(db), getAncBoardCounts(db)]);
    const summed = dashboard.hospitals.reduce((sum, h) => sum + h.ancCounts.total, 0);

    expect(summed).toBe(board.risk.total);
  });

  it('the dashboard stage card and the ANC board report the same total', async () => {
    await seedMixedCohort();

    const [kpis, board] = await Promise.all([getStageKPIs(db), getAncBoardCounts(db)]);

    expect(kpis.pregnancy.total).toBe(board.risk.total);
  });

  it('a woman whose registering hospital was deactivated is counted the same way everywhere', async () => {
    // The stage card gated on hospitals.is_active while the board did not, so a
    // deactivated site silently moved one woman between the two headline numbers.
    await insertPregnancy('g-fresh', { lastAnc: daysAgo(5), edc: daysAhead(30) });
    await db.execute(`UPDATE hospitals SET is_active = FALSE WHERE id = ?`, [hospitalId]);

    const [kpis, board] = await Promise.all([getStageKPIs(db), getAncBoardCounts(db)]);

    expect(kpis.pregnancy.total).toBe(board.risk.total);
  });
});
