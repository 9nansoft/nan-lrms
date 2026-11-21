// The consult records are wiped with the hospital data.
//
// A consult is the patient's clinical record: it hangs off the admission, so
// every path that wipes the hospital's data must take it too — or the record
// survives a wipe and a foreign-key error rolls the whole wipe back.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { testSessionUser } from '../../helpers/session';
import { UserRole } from '@/types/domain';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST as clearRoute } from '@/app/api/dev/simulate/clear/route';
import { POST as resetRoute } from '@/app/api/dev/simulate/reset-onboarding/route';
import { POST as clearCacheRoute } from '@/app/api/admin/clear-cache/route';
import { DELETE as hospitalDataRoute } from '@/app/api/admin/hospitals/[hcode]/data/route';

const HCODE = '10716';

async function hospitalIdOf(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0]?.id ?? '';
}

async function seedConsult(hospitalId: string, id: string, an: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO patient_consults
       (id, hospital_id, patient_id, an, doctor_cid, doctor_name, reason, status,
        created_at, updated_at)
     VALUES (?, ?, NULL, ?, '1007000100999', 'แพทย์ที่ปรึกษาได้', 'ขอความเห็น', 'REQUESTED', ?, ?)`,
    [id, hospitalId, an, now, now],
  );
}

async function consultCount(hospitalId?: string): Promise<number> {
  const rows = hospitalId
    ? await db.query<{ n: number }>(
        'SELECT COUNT(*) AS n FROM patient_consults WHERE hospital_id = ?',
        [hospitalId],
      )
    : await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM patient_consults');
  return Number(rows[0]?.n ?? 0);
}

async function seedThreadMessage(consultId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO consult_messages
       (id, consult_id, sender_hospital_id, sender_cid, sender_name, body, message_type, created_at, updated_at)
     SELECT ?, id, hospital_id, '1007000100999', 'พย.ทดสอบ', 'ข้อความ', 'TEXT', ?, ?
       FROM patient_consults WHERE id = ?`,
    [id, now, now, consultId],
  );
}

async function messageCount(): Promise<number> {
  const rows = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM consult_messages');
  return Number(rows[0]?.n ?? 0);
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = testSessionUser({
    hospitalCode: HCODE,
    role: UserRole.ADMIN,
    accessMode: 'readwrite',
  });
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DEV_SIMULATION_ENABLED', 'true');
  vi.stubEnv('ADMIN_ALLOWED_CIDS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the consult records are wiped with the hospital data', () => {
  it('empties them on /api/dev/simulate/clear and keeps the hospital', async () => {
    await seedConsult(await hospitalIdOf(HCODE), 'pc-clear-1', 'AN-WIPE-1');

    const res = await clearRoute();

    expect(res.status).toBe(200);
    expect(await consultCount()).toBe(0);
    expect(await hospitalIdOf(HCODE)).not.toBe('');
  });

  it('empties them and deletes the hospital on /api/dev/simulate/reset-onboarding', async () => {
    await seedConsult(await hospitalIdOf(HCODE), 'pc-reset-1', 'AN-WIPE-2');

    const res = await resetRoute();

    expect(res.status).toBe(200);
    expect(await consultCount()).toBe(0);
  });

  it('empties them on /api/admin/clear-cache, threads included', async () => {
    await seedConsult(await hospitalIdOf(HCODE), 'pc-admin-1', 'AN-WIPE-3');
    await seedThreadMessage('pc-admin-1', 'cm-admin-1');

    const res = await clearCacheRoute();

    expect(res.status).toBe(200);
    expect(await consultCount()).toBe(0);
    expect(await messageCount()).toBe(0);
  });

  it('removes the consults of ONE hospital on /api/admin/hospitals/[hcode]/data, threads included', async () => {
    const otherHcode = '11002';
    const mine = await hospitalIdOf(HCODE);
    const theirs = await hospitalIdOf(otherHcode);
    await seedConsult(mine, 'pc-one-1', 'AN-WIPE-4');
    await seedThreadMessage('pc-one-1', 'cm-one-1');
    await seedConsult(theirs, 'pc-one-2', 'AN-WIPE-5');

    const res = await hospitalDataRoute(
      new Request(`http://test/api/admin/hospitals/${HCODE}/data`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirmHcode: HCODE }),
      }) as never,
      { params: Promise.resolve({ hcode: HCODE }) },
    );

    expect(res.status).toBe(200);
    expect(await consultCount(mine)).toBe(0);
    expect(await messageCount()).toBe(0);
    // The other hospital keeps its own.
    expect(await consultCount(theirs)).toBe(1);
  });
});
