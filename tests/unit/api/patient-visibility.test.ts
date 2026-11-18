// Patient visibility — a hospital reads its own patients, and only its own.
//
// The rule under test: a hospital's patient rows are visible to that
// hospital. Another hospital's rows are not — unless the reader is the
// centre hospital (level P/P+), the province office, or the other hospital
// sits below it in the node tree.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { testSessionUser } from '../../helpers/session';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET as hospitalPatientsRoute } from '@/app/api/hospitals/[hcode]/patients/route';
import { GET as patientDetailRoute } from '@/app/api/patients/[an]/route';
import { GET as highRiskRoute } from '@/app/api/dashboard/high-risk/route';

// รพ.พล (A) — the community hospital that signs in
const OWN_HCODE = '11004';
// รพ.บ้านไผ่ (A) — another community hospital
const OTHER_HCODE = '11002';
// รพ.ขอนแก่น (P+) — the centre hospital
const CENTRE_HCODE = '10670';

const OWN_AN = 'AN-OWN';
const OTHER_AN = 'AN-OTHER';

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedPatient(hcode: string, an: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
    [`p-${an}`, await hospitalId(hcode), `HN-${an}`, an, 'enc-name', 28, now, now, now, now],
  );
}

function signInAs(hcode: string): void {
  mockSessionUser = testSessionUser({ hospitalCode: hcode }) as unknown as Record<string, unknown>;
}

function hospitalPatientsRequest(hcode: string): NextRequest {
  return new NextRequest(`http://localhost/api/hospitals/${hcode}/patients`);
}

function hospitalPatientsParams(hcode: string): { params: Promise<{ hcode: string }> } {
  return { params: Promise.resolve({ hcode }) };
}

function patientDetailParams(an: string): { params: Promise<{ an: string }> } {
  return { params: Promise.resolve({ an }) };
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = null;
  await seedPatient(OWN_HCODE, OWN_AN);
  await seedPatient(OTHER_HCODE, OTHER_AN);
});

describe('hospital-scoped patient list', () => {
  it('serves the hospital its own patients', async () => {
    signInAs(OWN_HCODE);
    const res = await hospitalPatientsRoute(
      hospitalPatientsRequest(OWN_HCODE),
      hospitalPatientsParams(OWN_HCODE),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patients).toHaveLength(1);
    expect(body.patients[0].an).toBe(OWN_AN);
  });

  it('refuses another hospital\'s patient list', async () => {
    signInAs(OWN_HCODE);
    const res = await hospitalPatientsRoute(
      hospitalPatientsRequest(OTHER_HCODE),
      hospitalPatientsParams(OTHER_HCODE),
    );
    expect(res.status).toBe(403);
  });

  it('serves the centre hospital every hospital', async () => {
    signInAs(CENTRE_HCODE);
    const res = await hospitalPatientsRoute(
      hospitalPatientsRequest(OTHER_HCODE),
      hospitalPatientsParams(OTHER_HCODE),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patients).toHaveLength(1);
  });

  it('serves a node hospital the hospital below it', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospital_nodes (id, node_hospital_id, child_hospital_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      ['link-1', await hospitalId(OWN_HCODE), await hospitalId(OTHER_HCODE), now, now],
    );
    signInAs(OWN_HCODE);
    const res = await hospitalPatientsRoute(
      hospitalPatientsRequest(OTHER_HCODE),
      hospitalPatientsParams(OTHER_HCODE),
    );
    expect(res.status).toBe(200);
  });
});

describe('hospital-scoped patient detail', () => {
  it('serves the hospital its own patient', async () => {
    signInAs(OWN_HCODE);
    const res = await patientDetailRoute(
      new NextRequest(`http://localhost/api/patients/${OWN_HCODE}-${OWN_AN}`),
      patientDetailParams(`${OWN_HCODE}-${OWN_AN}`),
    );
    expect(res.status).toBe(200);
  });

  it('refuses another hospital\'s patient', async () => {
    signInAs(OWN_HCODE);
    const res = await patientDetailRoute(
      new NextRequest(`http://localhost/api/patients/${OTHER_HCODE}-${OTHER_AN}`),
      patientDetailParams(`${OTHER_HCODE}-${OTHER_AN}`),
    );
    expect(res.status).toBe(403);
  });
});

describe('hospital-scoped high-risk roster', () => {
  it('shows only the hospital\'s own active labor roster', async () => {
    signInAs(OWN_HCODE);
    const res = await highRiskRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patients.map((p: { an: string }) => p.an)).toEqual([OWN_AN]);
  });

  it('shows the centre hospital the province roster', async () => {
    signInAs(CENTRE_HCODE);
    const res = await highRiskRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patients).toHaveLength(2);
  });
});
