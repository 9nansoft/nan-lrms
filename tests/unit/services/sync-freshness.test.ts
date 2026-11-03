import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { getSyncFreshness } from '@/services/sync-freshness';

const NOW = new Date('2026-10-11T05:40:00Z');
const mins = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe('getSyncFreshness', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    const rows: Array<[string, string, string | null]> = [
      ['h1', '11000', mins(5)], // fresh
      ['h2', '11002', mins(60 * 24 * 18)], // 18 days stale (บ้านไผ่)
      ['h3', '10998', mins(90)], // stale
      ['h4', '77652', null], // never
      ['h5', '11004', new Date(NOW.getTime() + 3_600_000).toISOString()], // future-dated
      ['h99', '99999', mins(60 * 24 * 10)], // exempt pseudo-hospital
      ['h6', '11006', mins(2)], // recent sync but purged -> BLOCKED
    ];
    for (const [id, hcode, last] of rows) {
      await db.query(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, 'A_S', true, 'ONLINE', ?, NOW(), NOW())`,
        [id, hcode, `รพ.${hcode}`, last],
      );
    }
    // Every reporting hospital is onboarded (a BMS config row), as in production;
    // deriveSyncStatus treats a missing row as NEVER_SYNCED.
    for (const [id] of rows) {
      await db.query(
        `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, data_purged_at, created_at, updated_at)
         VALUES (?, ?, 'https://x', ?, NOW(), NOW())`,
        [`cfg-${id}`, id, id === 'h6' ? mins(1) : null],
      );
    }
    await db.query(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, labor_status, admit_date, synced_at, created_at, updated_at)
       VALUES ('p1','h1','HN1','AN1','enc',30,'ACTIVE',NOW(),NOW(),NOW(),NOW())`,
    );
    await db.query(
      `INSERT INTO cpd_scores (id, patient_id, score, risk_level, recommendation, calculated_at, created_at)
       VALUES ('c1','p1',11,'HIGH','-',NOW(),NOW())`,
    );
  });

  it('province summary excludes exempt hcodes and classifies every feed', async () => {
    const s = await getSyncFreshness(db, { hcode: null, now: NOW });
    expect(s.province).toEqual({
      reporting: 6,
      fresh: 1,
      stale: 4, // 18-day, 90-min, future-dated, BLOCKED (purged)
      never: 1,
      highRisk: 1,
      lastSyncAt: mins(5),
    });
    expect(s.own).toBeNull();
    expect(s.generatedAt).toBe(NOW.toISOString());
  });

  it('hospital session gets its own block', async () => {
    const s = await getSyncFreshness(db, { hcode: '11000', now: NOW });
    expect(s.own).toEqual({ hcode: '11000', name: 'รพ.11000', lastSyncAt: mins(5), health: 'ok', highRisk: 1 });
  });

  it.each(['99999', '00000', '55555', undefined])('exempt/unregistered/missing hcode %p → own null, no throw', async (hcode) => {
    const s = await getSyncFreshness(db, { hcode, now: NOW });
    expect(s.own).toBeNull();
    expect(s.province.reporting).toBe(6);
  });

  it('own block never leaks another hospital', async () => {
    const s = await getSyncFreshness(db, { hcode: '11002', now: NOW });
    expect(s.own?.hcode).toBe('11002');
    expect(JSON.stringify(s)).not.toContain('11000');
  });

  it('own health agrees with province classification for future-dated and never-synced feeds', async () => {
    const future = await getSyncFreshness(db, { hcode: '11004', now: NOW });
    expect(future.own?.health).toBe('stale');
    const never = await getSyncFreshness(db, { hcode: '77652', now: NOW });
    expect(never.own?.health).toBe('never');
  });

  it('a BLOCKED hospital with a recent sync is not fresh, and own.health is blocked', async () => {
    const own = await getSyncFreshness(db, { hcode: '11006', now: NOW });
    expect(own.own?.health).toBe('blocked');
    const s = await getSyncFreshness(db, { hcode: null, now: NOW });
    expect(s.province.fresh).toBe(1); // only 11000
  });

  it('a hospital with no BMS config row but a recent sync is fresh (webhook-only feed)', async () => {
    await db.query(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
       VALUES ('h7','11007','รพ.11007','A_S',true,'ONLINE',?,NOW(),NOW())`,
      [mins(1)],
    );
    const s = await getSyncFreshness(db, { hcode: '11007', now: NOW });
    expect(s.own?.health).toBe('ok');
  });

  it('a hospital with no BMS config row and no sync is never-synced', async () => {
    await db.query(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
       VALUES ('h8','11009','รพ.11009','A_S',true,'ONLINE',NULL,NOW(),NOW())`,
    );
    const s = await getSyncFreshness(db, { hcode: '11009', now: NOW });
    expect(s.own?.health).toBe('never');
  });
});
