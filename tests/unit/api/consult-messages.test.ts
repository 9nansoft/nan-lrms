// The consult thread routes on the patient page.
//
// The messages are the patient's clinical data: they are read and written
// through the same patient-visibility scope as every other patient resource.
// The consult id arrives inside a patient path — the route must prove the
// consult belongs to THAT admission, so a consult id of another AN can never
// fish out another patient's thread.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { UserRole } from '@/types/domain';
import { testSessionUser } from '../../helpers/session';
import { createPatientConsult } from '@/services/consults';
import { listConsultMessages } from '@/services/consult-messages';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => undefined }));

import { GET, POST } from '@/app/api/patients/[an]/consults/[consultId]/messages/route';

const A = '11002'; // the requesting hospital
const B = '11004';
const HUB = '10716';
const AN = 'AN-THREAD-API';

let consultId = '';

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedDoctor(hcode: string, id: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_consult_doctors
       (id, hospital_id, cid, name, position, phone_number, is_active, created_at, updated_at)
     VALUES (?, ?, '1007000100999', ?, 'สูติแพทย์', '0800000000', true, ?, ?)`,
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

function signInAs(
  hcode: string,
  overrides: { role?: UserRole; userCid?: string; name?: string } = {},
): void {
  mockSessionUser = testSessionUser({
    hospitalCode: hcode,
    ...overrides,
  }) as unknown as Record<string, unknown>;
}

function routeRequest(
  anPath: string,
  consultIdPath: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(`http://test/api/patients/${anPath}/consults/${consultIdPath}/messages`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as NextRequest;
}

const routeParams = (anPath: string, consultIdPath: string) => ({
  params: Promise.resolve({ an: anPath, consultId: consultIdPath }),
});

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = null;
  await seedPatient(A, AN);
  await seedDoctor(HUB, 'doc-hub-1');

  const created = await createPatientConsult(db, {
    an: AN,
    hospitalId: await hospitalId(A),
    patientId: `p-${AN}`,
    journeyId: null,
    doctorId: 'doc-hub-1',
    reason: 'ความดันสูง BP 160/110',
    mode: 'HUB',
    urgency: 'URGENT',
    requestedByCid: null,
    requestedByName: null,
  });
  if (!created.ok) throw new Error('the seeded HUB consult must create');
  consultId = created.consult.id;
});

describe('GET .../consults/[consultId]/messages', () => {
  it('serves the thread to the requesting hospital', async () => {
    signInAs(A);

    const res = await GET(
      routeRequest(`${A}-${AN}`, consultId),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toEqual([]);
  });

  it('serves the thread to a clinician of the hub the consult went up to', async () => {
    signInAs(HUB, { role: UserRole.OBSTETRICIAN });

    const res = await GET(
      routeRequest(`${A}-${AN}`, consultId),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(200);
  });

  it('refuses another hospital — its visibility scope never reaches the patient', async () => {
    signInAs(B);

    const res = await GET(
      routeRequest(`${A}-${AN}`, consultId),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(403);
  });

  it('answers 404 when the consult id does not belong to the AN in the URL', async () => {
    signInAs(A);
    // A second consult of a DIFFERENT admission at the same hospital.
    await seedPatient(A, 'AN-OTHER');
    await seedDoctor(HUB, 'doc-hub-2');
    const other = await createPatientConsult(db, {
      an: 'AN-OTHER',
      hospitalId: await hospitalId(A),
      patientId: 'p-AN-OTHER',
      journeyId: null,
      doctorId: 'doc-hub-2',
      reason: 'ของคนไข้อีกคน',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    // Consult AN-OTHER's thread through AN-THREAD-API's path — refused even
    // though both consults belong to the requesting hospital.
    const res = await GET(
      routeRequest(`${A}-${AN}`, other.consult.id),
      routeParams(`${A}-${AN}`, other.consult.id),
    );

    expect(res.status).toBe(404);
  });

  it('answers 401 without a session', async () => {
    const res = await GET(
      routeRequest(`${A}-${AN}`, consultId),
      routeParams(`${A}-${AN}`, consultId),
    );
    expect(res.status).toBe(401);
  });
});

describe('POST .../consults/[consultId]/messages', () => {
  it('stores the message for the requesting team and returns it', async () => {
    signInAs(A, { userCid: '1100500090006', name: 'พย.ศิริพร รักดี' });

    const res = await POST(
      routeRequest(`${A}-${AN}`, consultId, { body: 'ผู้ป่วยชัก กำลังให้ออกซิเจนค่ะ' }),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message.body).toBe('ผู้ป่วยชัก กำลังให้ออกซิเจนค่ะ');
    expect(body.message.senderName).toBe('พย.ศิริพร รักดี');

    const messages = await listConsultMessages(db, consultId);
    expect(messages).toHaveLength(1);
  });

  it('refuses the hub nurse with the service’s Thai message', async () => {
    signInAs(HUB, { role: UserRole.NURSE });

    const res = await POST(
      routeRequest(`${A}-${AN}`, consultId, { body: 'ข้อความ' }),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.message).toContain('แพทย์');
  });

  it('refuses an empty message body', async () => {
    signInAs(A);

    const res = await POST(
      routeRequest(`${A}-${AN}`, consultId, { body: '   ' }),
      routeParams(`${A}-${AN}`, consultId),
    );

    expect(res.status).toBe(400);
  });
});
