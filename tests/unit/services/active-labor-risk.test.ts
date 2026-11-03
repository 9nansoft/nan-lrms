import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { countActiveLaborByRisk } from '@/services/dashboard';

async function seedHospital(db: PgliteAdapter, id: string, hcode: string) {
  await db.query(
    `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, 'A_S', true, 'ONLINE', NOW(), NOW())`,
    [id, hcode, `รพ.${hcode}`],
  );
}
async function seedPatient(db: PgliteAdapter, id: string, hospitalId: string, status: string, risk: string | null) {
  await db.query(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, labor_status, admit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc', 30, ?, NOW(), NOW(), NOW(), NOW())`,
    [id, hospitalId, `HN-${id}`, `AN-${id}`, status],
  );
  if (risk) {
    await db.query(
      `INSERT INTO cpd_scores (id, patient_id, score, risk_level, recommendation, calculated_at, created_at)
       VALUES (?, ?, 11, ?, '-', NOW(), NOW())`,
      [`cs-${id}`, id, risk],
    );
  }
}

describe('countActiveLaborByRisk', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    await seedHospital(db, 'h1', '11000');
    await seedHospital(db, 'h2', '11002');
    await seedPatient(db, 'p1', 'h1', 'ACTIVE', 'HIGH');
    await seedPatient(db, 'p2', 'h1', 'ACTIVE', 'HIGH');
    await seedPatient(db, 'p3', 'h1', 'DELIVERED', 'HIGH'); // not active → excluded
    await seedPatient(db, 'p4', 'h2', 'ACTIVE', 'LOW');
  });

  it('counts ACTIVE labour by latest risk per hospital, as numbers', async () => {
    const rows = await countActiveLaborByRisk(db);
    const high = rows.find((r) => r.hcode === '11000' && r.risk_level === 'HIGH');
    expect(high?.count).toBe(2);
    expect(typeof high?.count).toBe('number');
    expect(rows.find((r) => r.hcode === '11002' && r.risk_level === 'LOW')?.count).toBe(1);
  });

  it('filters to one hospital by hcode', async () => {
    const rows = await countActiveLaborByRisk(db, { hcode: '11002' });
    expect(new Set(rows.map((r) => r.hcode))).toEqual(new Set(['11002']));
  });
});
