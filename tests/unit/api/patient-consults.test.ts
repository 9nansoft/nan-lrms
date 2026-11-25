// The consult routes on the patient page.
//
// A consult is the patient's clinical record: it is read and written through
// the same patient-visibility scope as every other patient resource. A
// hospital sees its own admissions; another hospital's patient is not found
// at all.
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

import { GET, POST } from '@/app/api/patients/[an]/consults/route';
import { PATCH } from '@/app/api/patients/[an]/consults/[consultId]/route';

const A = '11002';
const B = '11004';
const AN = 'AN-API-CONSULT';

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

function signInAs(
  hcode: string,
  overrides: { role?: UserRole; userCid?: string; name?: string } = {},
): void {
  mockSessionUser = testSessionUser({
    hospitalCode: hcode,
    ...overrides,
  }) as unknown as Record<string, unknown>;
}

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = null;
  await seedPatient(A, AN);
  await seedDoctor(A, 'doc-a-1');
  await seedDoctor(B, 'doc-b-1');
});

describe('GET /api/patients/[an]/consults', () => {
  it('serves the hospital its own admission’s consults and doctors', async () => {
    signInAs(A);

    const res = await GET(
      new NextRequest(`http://test/api/patients/${A}-${AN}/consults`) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consults).toEqual([]);
    expect(body.doctors.map((d: { id: string }) => d.id)).toEqual(['doc-a-1']);
  });

  it('refuses another hospital’s patient', async () => {
    signInAs(B);

    const res = await GET(
      new NextRequest(`http://test/api/patients/${A}-${AN}/consults`) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(403);
  });

  it('answers 404 for an unknown admission', async () => {
    signInAs(A);

    const res = await GET(
      new NextRequest(`http://test/api/patients/${A}-AN-NOPE/consults`) as never,
      { params: Promise.resolve({ an: `${A}-AN-NOPE` }) },
    );

    expect(res.status).toBe(404);
  });
});

describe('POST /api/patients/[an]/consults', () => {
  it('records the consult', async () => {
    signInAs(A);

    const res = await POST(
      jsonRequest({ doctorId: 'doc-a-1', reason: 'สงสัย preeclampsia' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.consult.reason).toBe('สงสัย preeclampsia');
    expect(body.consult.doctorName).toBe('แพทย์ doc-a-1');
    expect(body.consult.status).toBe('REQUESTED');
  });

  it('refuses a doctor of another hospital', async () => {
    signInAs(A);

    const res = await POST(
      jsonRequest({ doctorId: 'doc-b-1', reason: 'ขอความเห็น' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(400);
  });

  it('refuses a push without a doctor', async () => {
    signInAs(A);

    const res = await POST(
      jsonRequest({ reason: 'ขอความเห็น' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(400);
  });

  it('refuses another hospital’s patient', async () => {
    signInAs(B);

    const res = await POST(
      jsonRequest({ doctorId: 'doc-b-1', reason: 'ขอความเห็น' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/patients/[an]/consults/[consultId]', () => {
  it('answers the consult and keeps the advice', async () => {
    signInAs(A);
    const created = await POST(
      jsonRequest({ doctorId: 'doc-a-1', reason: 'สงสัย preeclampsia' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );
    const { consult } = await created.json();

    const res = await PATCH(
      new NextRequest('http://test/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', advice: 'คุมความดัน' }),
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}`, consultId: consult.id }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.consult.status).toBe('COMPLETED');
    expect(body.consult.advice).toBe('คุมความดัน');
  });

  it('refuses to touch the consult of another hospital’s admission', async () => {
    signInAs(A);
    const created = await POST(
      jsonRequest({ doctorId: 'doc-a-1', reason: 'ของ รพ.เอ' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );
    const { consult } = await created.json();

    signInAs(B);
    const res = await PATCH(
      new NextRequest('http://test/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED' }),
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}`, consultId: consult.id }) },
    );

    expect(res.status).toBe(403);
  });
});

// ─── HUB consults — the question sent up to the provincial hub ──────────────
//
// The hub is 10716 (PROVINCIAL_HUB of the seeded network). Its doctors are
// addressed by their contact-list row; a clinician of the hub answers with
// their BMS session (their CID must match the addressed doctor's).
describe('HUB consults over the patient routes', () => {
  const HUB = '10716';

  it('reports the hub with its registered doctors on GET', async () => {
    signInAs(A);
    seedDoctor(HUB, 'doc-hub-get');

    const res = await GET(
      new NextRequest(`http://test/api/patients/${A}-${AN}/consults`) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.hub.hcode).toBe(HUB);
    expect(body.hub.available).toBe(true);
    expect(body.hub.doctors.map((d: { id: string }) => d.id)).toContain('doc-hub-get');
  });

  it('creates a HUB consult addressed to the hub’s doctor', async () => {
    signInAs(A);
    seedDoctor(HUB, 'doc-hub-post');

    const res = await POST(
      jsonRequest({
        doctorId: 'doc-hub-post',
        reason: 'ความดันสูง BP 160/110',
        mode: 'HUB',
        urgency: 'URGENT',
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.consult.consultScope).toBe('HUB');
    expect(body.consult.urgencyLevel).toBe('URGENT');
    expect(body.consult.targetHospitalName).toBe('โรงพยาบาลน่าน');
  });

  it('lets the hub clinician answer it, and refuses the requester’s advice', async () => {
    signInAs(A);
    seedDoctor(HUB, 'doc-hub-patch');
    const created = await POST(
      jsonRequest({ doctorId: 'doc-hub-patch', reason: 'ความดันสูง', mode: 'HUB' }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );
    const { consult } = await created.json();

    // The requesting team may only progress the status — the advice must
    // come from the doctors being asked.
    signInAs(A);
    const refused = await PATCH(
      new NextRequest('http://test/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advice: 'จดเองไม่ได้' }),
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}`, consultId: consult.id }) },
    );
    expect(refused.status).toBe(403);

    // The hub clinician answers in the system.
    signInAs(HUB, { role: UserRole.OBSTETRICIAN, userCid: '1007000100999', name: 'นพ.สูติศาสตร์' });
    const answered = await PATCH(
      new NextRequest('http://test/api', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'COMPLETED', advice: 'คุมความดันและประเมินส่งต่อ' }),
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}`, consultId: consult.id }) },
    );
    expect(answered.status).toBe(200);
    const body = await answered.json();
    expect(body.consult.status).toBe('COMPLETED');
    expect(body.consult.advice).toBe('คุมความดันและประเมินส่งต่อ');
    expect(body.consult.answeredByName).toBe('นพ.สูติศาสตร์');
  });

  it('allows the parent hospital (รพ.แม่ข่าย) to POST a proactive inbox warning without doctorId', async () => {
    signInAs(HUB, {
      role: UserRole.OBSTETRICIAN,
      userCid: '1100700200001',
      name: 'นพ.แม่ข่าย เตือน',
    });

    const res = await POST(
      jsonRequest({
        reason: 'ผลประเมินพบความเสี่ยงสูง กรุณาประเมินซ้ำและเตรียมส่งต่อ',
        mode: 'HUB',
        urgency: 'EMERGENCY',
      }) as never,
      { params: Promise.resolve({ an: `${A}-${AN}` }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.consult.consultScope).toBe('HUB');
    expect(body.consult.status).toBe('CONTACTED');
    expect(body.consult.urgencyLevel).toBe('EMERGENCY');
    expect(body.consult.messageCount).toBe(1);
  });
});
