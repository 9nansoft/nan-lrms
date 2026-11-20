// The assessment label cache is a CHILD of `hospitals` — every wipe path
// that removes hospital data has to remove it too, or the DELETE FROM
// `hospitals` fails on the foreign key and the wipe rolls back.
//
// The rules under test:
//   1. /api/dev/simulate/clear empties the label cache (the hospital stays).
//   2. /api/dev/simulate/reset-onboarding empties it AND deletes the
//      hospital — no foreign-key error.
//   3. /api/admin/clear-cache empties it — and the pull CURSORS with it: a
//      surviving cursor would make the next pull skip every row below it.
//   4. /api/admin/hospitals/[hcode]/data removes the cache of THAT hospital
//      only.
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

async function seedCacheRow(hospitalId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_assessment_form_metadata
       (id, hospital_id, form_table, form_id, form_name, items_json,
        synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      hospitalId,
      'asm_lr_record_after_birth_nan',
      309,
      'แบบฟอร์มหลังคลอด',
      '[]',
      now,
      now,
      now,
    ],
  );
}

async function cacheRowCount(): Promise<number> {
  const rows = await db.query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM cached_assessment_form_metadata',
  );
  return Number(rows[0]?.n ?? 0);
}

async function seedCursorRow(hospitalId: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_maternity_assessment_cursors
       (id, hospital_id, form_table, cursor_pk, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, hospitalId, 'asm_first_pregnant_pt_nan', '4242', now],
  );
}

async function cursorRowCount(): Promise<number> {
  const rows = await db.query<{ n: number }>(
    'SELECT COUNT(*) AS n FROM cached_maternity_assessment_cursors',
  );
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

describe('the assessment label cache is wiped with the hospital data', () => {
  it('empties the cache on /api/dev/simulate/clear and keeps the hospital', async () => {
    await seedCacheRow(await hospitalIdOf(HCODE), 'cam-clear-1');

    const res = await clearRoute();

    expect(res.status).toBe(200);
    expect(await cacheRowCount()).toBe(0);
    expect(await hospitalIdOf(HCODE)).not.toBe('');
  });

  it('empties the cache and deletes the hospital on /api/dev/simulate/reset-onboarding', async () => {
    await seedCacheRow(await hospitalIdOf(HCODE), 'cam-reset-1');

    const res = await resetRoute();

    // The wipe must NOT fail on the foreign key of the new table.
    expect(res.status).toBe(200);
    expect(await cacheRowCount()).toBe(0);
    expect(await hospitalIdOf(HCODE)).toBe('');
  });

  it('empties the cache and the pull cursors on /api/admin/clear-cache', async () => {
    await seedCacheRow(await hospitalIdOf(HCODE), 'cam-admin-clear-1');
    await seedCursorRow(await hospitalIdOf(HCODE), 'cursor-admin-clear-1');

    const res = await clearCacheRoute();

    expect(res.status).toBe(200);
    expect(await cacheRowCount()).toBe(0);
    // A cursor that survives the clear would skip every row below it on the
    // next pull — the rows older than the reconcile window would never come
    // back after the clear.
    expect(await cursorRowCount()).toBe(0);
  });

  it('removes the cache of ONE hospital on /api/admin/hospitals/[hcode]/data', async () => {
    const other = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode <> ?', [
      HCODE,
    ]);
    const otherId = other[0].id;
    await seedCacheRow(await hospitalIdOf(HCODE), 'cam-one-1');
    await seedCacheRow(otherId, 'cam-one-2');

    const request = {
      json: async () => ({ confirmHcode: HCODE }),
    } as unknown as Parameters<typeof hospitalDataRoute>[0];
    const res = await hospitalDataRoute(request, {
      params: Promise.resolve({ hcode: HCODE }),
    });

    expect(res.status).toBe(200);
    const rows = await db.query<{ id: string }>(
      'SELECT id FROM cached_assessment_form_metadata WHERE hospital_id = ?',
      [await hospitalIdOf(HCODE)],
    );
    expect(rows).toHaveLength(0);
    // The other hospital's cache is untouched.
    const otherRows = await db.query<{ id: string }>(
      'SELECT id FROM cached_assessment_form_metadata WHERE hospital_id = ?',
      [otherId],
    );
    expect(otherRows).toHaveLength(1);
  });
});
