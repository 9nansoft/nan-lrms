// Consult messages — the thread two teams talk in while a HUB consult is
// open, bound to the consult, which is bound to the admission's AN.
//
// The rules under test:
//   1. Only the two sides of the consult reach the thread: the requesting
//      hospital's care team writes freely, the hub's side writes only as a
//      clinician, everyone else (a third hospital, a province account) is
//      refused.
//   2. INTERNAL consults have no thread — that flow is a phone call.
//   3. A closed (COMPLETED) consult's thread is the record: read-only.
//   4. The sender is SNAPSHOTTED on the message, and the consult's own
//      status moves land in the thread as SYSTEM notes — the thread reads
//      as the complete record of the case.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  createConsultMessage,
  listConsultMessages,
} from '@/services/consult-messages';
import {
  createPatientConsult,
  listHubConsultInbox,
  listPatientConsults,
  updatePatientConsult,
} from '@/services/consults';
import type { ConsultActor } from '@/services/consults';

const A = '11002'; // the requesting hospital
const B = '11004'; // a third hospital — neither side of the consult
const HUB = '10716'; // the PROVINCIAL_HUB of the seeded network
const AN = 'AN-THREAD-1';

let db: DatabaseAdapter;

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

const requesterActor: ConsultActor = {
  hospitalId: '', // filled in beforeEach-helpers below
  role: 'NURSE',
  userCid: '1100500090006',
  name: 'พย.ศิริพร รักดี',
};
const hubClinicianActor: ConsultActor = {
  hospitalId: '',
  role: 'OBSTETRICIAN',
  userCid: '1100700200001',
  name: 'นพ.สูติศาสตร์ แม่ข่าย',
};
const hubNurseActor: ConsultActor = {
  hospitalId: '',
  role: 'NURSE',
  userCid: '1100700300001',
  name: 'พย.แม่ข่าย',
};
const thirdHospitalActor: ConsultActor = {
  hospitalId: '',
  role: 'OBSTETRICIAN',
  userCid: '1100900100001',
  name: 'นพ.ที่ไม่เกี่ยวข้อง',
};

let consultId = '';

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  await seedPatient(A, AN);
  await seedDoctor(HUB, 'doc-hub-1');

  requesterActor.hospitalId = await hospitalId(A);
  hubClinicianActor.hospitalId = await hospitalId(HUB);
  hubNurseActor.hospitalId = await hospitalId(HUB);
  thirdHospitalActor.hospitalId = await hospitalId(B);

  const created = await createPatientConsult(db, {
    an: AN,
    hospitalId: await hospitalId(A),
    patientId: `p-${AN}`,
    journeyId: null,
    doctorId: 'doc-hub-1',
    reason: 'ความดันสูง BP 160/110',
    mode: 'HUB',
    urgency: 'URGENT',
    requestedByCid: requesterActor.userCid,
    requestedByName: requesterActor.name,
  });
  if (!created.ok) throw new Error('the seeded HUB consult must create');
  consultId = created.consult.id;
});

function assertRejected(
  result: { ok: boolean; error?: string; status?: number },
  status: number,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.status).toBe(status);
  expect(result.error).toBeTruthy();
}

describe('createConsultMessage', () => {
  it('lets the requesting team send, snapshotting the sender', async () => {
    const sent = await createConsultMessage(db, consultId, requesterActor, {
      body: 'ผู้ป่วยชัก กำลังให้ออกซิเจนค่ะ',
    });

    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.message.body).toBe('ผู้ป่วยชัก กำลังให้ออกซิเจนค่ะ');
    expect(sent.message.senderName).toBe('พย.ศิริพร รักดี');
    expect(sent.message.senderCid).toBe('1100500090006');
    expect(sent.message.senderHospitalHcode).toBe(A);
    expect(sent.message.messageType).toBe('TEXT');
  });

  it('lets a clinician of the hub answer in the thread', async () => {
    const sent = await createConsultMessage(db, consultId, hubClinicianActor, {
      body: 'ให้ MgSO4 และประเมินครรภ์ แล้วแจ้งกลับ',
    });

    expect(sent.ok).toBe(true);
  });

  it('refuses the hub nurse — the hub side writes only as a clinician', async () => {
    assertRejected(
      await createConsultMessage(db, consultId, hubNurseActor, { body: 'ข้อความ' }),
      403,
    );
  });

  it('refuses a third hospital that is neither side', async () => {
    assertRejected(
      await createConsultMessage(db, consultId, thirdHospitalActor, { body: 'ข้อความ' }),
      403,
    );
  });

  it('refuses an empty message and one over 2000 characters', async () => {
    assertRejected(await createConsultMessage(db, consultId, requesterActor, { body: '   ' }), 400);
    assertRejected(
      await createConsultMessage(db, consultId, requesterActor, { body: 'ก'.repeat(2001) }),
      400,
    );
  });

  it('lets the team talk an INTERNAL consult through among themselves', async () => {
    await seedDoctor(A, 'doc-a-1');
    const internal = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'ปรึกษาในโรงพยาบาล',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(internal.ok).toBe(true);
    if (!internal.ok) return;

    const sent = await createConsultMessage(db, internal.consult.id, requesterActor, {
      body: 'ห้องคลอดเตรียมของเรียบร้อยค่ะ',
    });
    expect(sent.ok).toBe(true);

    const messages = await listConsultMessages(db, internal.consult.id);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe('ห้องคลอดเตรียมของเรียบร้อยค่ะ');
  });

  it('closes the thread with the consult — completed means read-only', async () => {
    const answered = await updatePatientConsult(db, consultId, hubClinicianActor, {
      status: 'COMPLETED',
      advice: 'ให้ MgSO4 และส่งต่อ',
    });
    expect(answered.ok).toBe(true);

    assertRejected(
      await createConsultMessage(db, consultId, hubClinicianActor, { body: 'ข้อความหลังปิด' }),
      403,
    );
    assertRejected(
      await createConsultMessage(db, consultId, requesterActor, { body: 'ข้อความหลังปิด' }),
      403,
    );
  });
});

describe('the thread as the record of the case', () => {
  it('lists the messages oldest first, sender and side joined in', async () => {
    await createConsultMessage(db, consultId, requesterActor, { body: 'ข้อความแรกจาก รพ.ชุมชน' });
    await createConsultMessage(db, consultId, hubClinicianActor, { body: 'ข้อความจากทีมแม่ข่าย' });

    const messages = await listConsultMessages(db, consultId);

    expect(messages.map((m) => m.body)).toEqual(['ข้อความแรกจาก รพ.ชุมชน', 'ข้อความจากทีมแม่ข่าย']);
    expect(messages[0].senderName).toBe('พย.ศิริพร รักดี');
    expect(messages[0].senderHospitalHcode).toBe(A);
    expect(messages[0].messageType).toBe('TEXT');
  });

  it('records the consult status moves as SYSTEM notes inside the thread', async () => {
    const progressed = await updatePatientConsult(db, consultId, requesterActor, {
      status: 'CONTACTED',
    });
    expect(progressed.ok).toBe(true);

    const answered = await updatePatientConsult(db, consultId, hubClinicianActor, {
      status: 'COMPLETED',
      advice: 'ให้ MgSO4 และส่งต่อ',
    });
    expect(answered.ok).toBe(true);

    const messages = await listConsultMessages(db, consultId);
    const systemNotes = messages.filter((m) => m.messageType === 'SYSTEM');
    expect(systemNotes).toHaveLength(2);
    expect(systemNotes[0].body).toContain('กำลังปรึกษา');
    expect(systemNotes[1].body).toContain('ปิดคำปรึกษา');
    // The note knows who made the move.
    expect(systemNotes[0].body).toContain('พย.ศิริพร รักดี');
    expect(systemNotes[1].body).toContain('นพ.สูติศาสตร์ แม่ข่าย');
  });

  it('counts only the human messages on the consult rows', async () => {
    await createConsultMessage(db, consultId, requesterActor, { body: 'ข้อความหนึ่ง' });
    await updatePatientConsult(db, consultId, requesterActor, { status: 'CONTACTED' });
    await createConsultMessage(db, consultId, hubClinicianActor, { body: 'ข้อความสอง' });

    const consults = await listPatientConsults(db, AN, await hospitalId(A));
    expect(consults).toHaveLength(1);
    // Two TEXT messages; the SYSTEM note of the status move is not counted.
    expect(consults[0].messageCount).toBe(2);

    const inbox = await listHubConsultInbox(db, await hospitalId(HUB));
    expect(inbox[0].messageCount).toBe(2);
  });

  it('keeps one patient’s thread out of another consult’s id', async () => {
    // A second admission at the hub's own hospital (its consults would stay
    // INTERNAL, but the message table must still never mix across consults).
    const other = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-1',
      reason: 'คำปรึกษาที่สองของ AN เดียวกัน',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    await createConsultMessage(db, consultId, requesterActor, { body: 'ของคำปรึกษาแรก' });

    const otherMessages = await listConsultMessages(db, other.consult.id);
    expect(otherMessages).toHaveLength(0);
  });
});
