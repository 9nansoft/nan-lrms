// The hub's consult inbox route.
//
// A HUB consult is the question a community hospital sent UP to the
// provincial hub. Only clinicians of the hub (OBSTETRICIAN / ADMIN) work the
// inbox, and it lists only the consults addressed to THEIR hospital — a
// third hospital's inbox stays empty.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { UserRole } from '@/types/domain';
import { testSessionUser } from '../../helpers/session';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => undefined }));

import { GET } from '@/app/api/consults/inbox/route';
import { createPatientConsult } from '@/services/consults';

const A = '11002'; // a community hospital (the requester)
const HUB = '10716'; // the provincial hub (the answering side)
const B = '11004'; // a third hospital
const AN = 'AN-INBOX-1';

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedDoctor(hcode: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_consult_doctors
       (id, hospital_id, cid, name, position, phone_number, is_active, created_at, updated_at)
     VALUES (?, ?, '1007000100999', ?, 'สูติแพทย์ที่ปรึกษาได้', '0800000000', true, ?, ?)`,
    [id, await hospitalId(hcode), `แพทย์ ${id}`, now, now],
  );
}

async function seedPatient(hcode: string, an: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, '2026-11-19T00:00:00Z', 'ACTIVE', ?, ?, ?)`,
    [`p-${an}`, await hospitalId(hcode), `HN-${an}`, an, now, now, now],
  );
}

function signInAs(hcode: string, overrides: { role?: UserRole } = {}): void {
  mockSessionUser = testSessionUser({ hospitalCode: hcode, ...overrides }) as unknown as Record<
    string,
    unknown
  >;
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = null;
  await seedPatient(A, AN);
  await seedDoctor(HUB, 'doc-hub-inbox');
});

async function seedHubConsult(): Promise<void> {
  const created = await createPatientConsult(db, {
    an: AN,
    hospitalId: await hospitalId(A),
    patientId: `p-${AN}`,
    journeyId: null,
    doctorId: 'doc-hub-inbox',
    reason: 'ความดันสูง BP 160/110',
    mode: 'HUB',
    urgency: 'URGENT',
    requestedByCid: null,
    requestedByName: 'พว.ท่าวังผา',
  });
  if (!created.ok) throw new Error(created.error);
}

describe('GET /api/consults/inbox', () => {
  it('serves the hub clinician the consults addressed to their hospital', async () => {
    await seedHubConsult();
    signInAs(HUB, { role: UserRole.OBSTETRICIAN });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consults).toHaveLength(1);
    expect(body.consults[0].an).toBe(AN);
    expect(body.consults[0].consultScope).toBe('HUB');
    expect(body.consults[0].requesterHospitalName).toContain('บ้านไผ่');
    expect(body.consults[0].patientUrlId).toBe(`${A}-${AN}`);
    expect(body.pendingCount).toBe(1);
  });

  it('refuses a nurse — only the hub’s clinicians work the inbox', async () => {
    await seedHubConsult();
    signInAs(HUB, { role: UserRole.NURSE });

    const res = await GET();

    expect(res.status).toBe(403);
  });

  it('shows an empty inbox to a hospital nobody consulted', async () => {
    await seedHubConsult();
    signInAs(B, { role: UserRole.OBSTETRICIAN });

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consults).toHaveLength(0);
    expect(body.pendingCount).toBe(0);
  });

  it('says so for an unauthenticated request', async () => {
    mockSessionUser = null;

    const res = await GET();

    expect(res.status).toBe(401);
  });
});
