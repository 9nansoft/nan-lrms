// GET /api/patients/[an]/assessments — tenant scope.
//
// The forms are the ward's own clinical records: a hospital reads its own
// admissions, a provincial account reads the province's, and the hcode in
// the URL grants nothing on its own.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET } from '@/app/api/patients/[an]/assessments/route';

const OWN_HCODE = '10716';
const OTHER_HCODE = '11008';
const PROVINCE_HCODE = '00042';

function request(an: string) {
  return new Request(`http://test/api/patients/${an}/assessments`) as never;
}

async function seedPatient(hcode: string, an: string, id: string) {
  const hospitals = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
    hcode,
  ]);
  if (hospitals.length === 0) return;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, ?, 'ACTIVE', ?, ?, ?)`,
    [id, hospitals[0].id, `hn-${an}`, an, '2026-11-17T14:21:00', now, now, now],
  );
}

describe('GET /api/patients/[an]/assessments — tenant scope', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    await seedPatient(OWN_HCODE, 'AN-OWN', 'pat-own');
    await seedPatient(OTHER_HCODE, 'AN-OTHER', 'pat-other');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a hospital read its own admission', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: OWN_HCODE });
    const res = await GET(request(`${OWN_HCODE}-AN-OWN`), {
      params: Promise.resolve({ an: `${OWN_HCODE}-AN-OWN` }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments).toEqual([]);
  });

  it('denies a hospital reading another hospital’s admission', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: OWN_HCODE });
    const res = await GET(request(`${OTHER_HCODE}-AN-OTHER`), {
      params: Promise.resolve({ an: `${OTHER_HCODE}-AN-OTHER` }),
    });
    expect(res.status).toBe(403);
  });

  it('lets a provincial account read any admission', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: PROVINCE_HCODE });
    const res = await GET(request(`${OTHER_HCODE}-AN-OTHER`), {
      params: Promise.resolve({ an: `${OTHER_HCODE}-AN-OTHER` }),
    });
    expect(res.status).toBe(200);
  });

  it('denies an anonymous caller', async () => {
    mockSessionUser = null;
    const res = await GET(request(`${OWN_HCODE}-AN-OWN`), {
      params: Promise.resolve({ an: `${OWN_HCODE}-AN-OWN` }),
    });
    expect(res.status).toBe(401);
  });

  it('answers 404 for an admission that does not exist', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: OWN_HCODE });
    const res = await GET(request(`${OWN_HCODE}-AN-NOPE`), {
      params: Promise.resolve({ an: `${OWN_HCODE}-AN-NOPE` }),
    });
    expect(res.status).toBe(404);
  });
});
