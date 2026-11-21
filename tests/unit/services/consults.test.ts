// Consults — the care team asking one of the hospital's own doctors for
// advice about a patient who stays here.
//
// The rules under test:
//   1. The doctor must be on THAT hospital's active list — a doctor of
//      another hospital is a referral, not a consult.
//   2. The doctor's name is SNAPSHOTTED on the record: the contact list
//      changes, the record must still say who was consulted.
//   3. The record is the patient's clinical data: it is hospital-scoped, so
//      one hospital can never read or touch another's consult.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  countPendingHubConsults,
  createPatientConsult,
  listConsultDoctors,
  listHubConsultInbox,
  listPatientConsults,
  resolveConsultTarget,
  updatePatientConsult,
} from '@/services/consults';

const A = '11002'; // the hospital the care team works in
const B = '11004'; // another hospital
const AN = 'AN-CONSULT-1';

let db: DatabaseAdapter;

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedDoctor(
  hcode: string,
  id: string,
  options: { active?: boolean; name?: string } = {},
): Promise<string> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_consult_doctors
       (id, hospital_id, cid, name, position, phone_number, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'สูติแพทย์ที่ปรึกษาได้', '0800000000', ?, ?, ?)`,
    [
      id,
      await hospitalId(hcode),
      `1007000100${id.length}`,
      options.name ?? `แพทย์ ${id}`,
      options.active ?? true,
      now,
      now,
    ],
  );
  return id;
}

async function seedPatient(hcode: string, an: string): Promise<string> {
  const now = new Date().toISOString();
  const id = `p-${an}`;
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, '2026-11-19T00:00:00Z', 'ACTIVE', ?, ?, ?)`,
    [id, await hospitalId(hcode), `HN-${an}`, an, now, now, now],
  );
  return id;
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  await seedPatient(A, AN);
  await seedDoctor(A, 'doc-a-1');
  await seedDoctor(B, 'doc-b-1');
});

describe('consult doctors', () => {
  it('lists only the active doctors of that hospital', async () => {
    await seedDoctor(A, 'doc-a-2', { active: false });

    const doctors = await listConsultDoctors(db, await hospitalId(A));

    expect(doctors.map((d) => d.id)).toEqual(['doc-a-1']);
  });

  it('does not list another hospital’s doctors', async () => {
    const doctors = await listConsultDoctors(db, await hospitalId(A));

    expect(doctors.map((d) => d.id)).not.toContain('doc-b-1');
  });
});

describe('createPatientConsult', () => {
  it('records the consult and snapshots the doctor', async () => {
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'สงสัย preeclampsia',
      requestedByCid: '1100500090006',
      requestedByName: 'พว.ทดสอบ',
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.consult.status).toBe('REQUESTED');
    expect(created.consult.doctorName).toBe('แพทย์ doc-a-1');
    expect(created.consult.doctorPosition).toBe('สูติแพทย์ที่ปรึกษาได้');
    expect(created.consult.doctorPhone).toBe('0800000000');
    expect(created.consult.reason).toBe('สงสัย preeclampsia');
    expect(created.consult.requestedByName).toBe('พว.ทดสอบ');
  });

  it('refuses a doctor of another hospital — that is a referral', async () => {
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-b-1',
      reason: 'ขอความเห็น',
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(400);
    const consults = await listPatientConsults(db, AN, await hospitalId(A));
    expect(consults).toHaveLength(0);
  });

  it('refuses an empty reason', async () => {
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: '   ',
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
  });

  it('refuses a doctor who was taken off the contact list', async () => {
    await db.execute("UPDATE hospital_consult_doctors SET is_active = false WHERE id = 'doc-a-1'");

    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'ขอความเห็น',
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
  });
});

describe('the consult records', () => {
  it('lists the consults of the admission, newest first', async () => {
    const hospitalA = await hospitalId(A);
    await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'คำปรึกษาแรก',
      requestedByCid: null,
      requestedByName: null,
    });
    await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'คำปรึกษาสอง',
      requestedByCid: null,
      requestedByName: null,
    });

    const consults = await listPatientConsults(db, AN, hospitalA);

    expect(consults).toHaveLength(2);
    expect(consults[0].reason).toBe('คำปรึกษาสอง');
  });

  it('does not show another hospital’s consults for a colliding AN', async () => {
    const hospitalA = await hospitalId(A);
    await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'ของ รพ.เอ',
      requestedByCid: null,
      requestedByName: null,
    });

    const consults = await listPatientConsults(db, AN, await hospitalId(B));

    expect(consults).toHaveLength(0);
  });

  it('marks the consult answered and keeps the advice', async () => {
    const hospitalA = await hospitalId(A);
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'สงสัย preeclampsia',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updatePatientConsult(db, created.consult.id, {
      hospitalId: hospitalA,
      role: 'NURSE',
      userCid: null,
      name: null,
    }, {
      status: 'COMPLETED',
      advice: 'ให้ตรวจ proteinuria และคุมความดัน',
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.consult.status).toBe('COMPLETED');
    expect(updated.consult.advice).toBe('ให้ตรวจ proteinuria และคุมความดัน');
    // The consult is "done" — it carries the moment it was answered.
    expect(updated.consult.consultedAt).not.toBeNull();
  });

  it('does not let one hospital touch another hospital’s consult', async () => {
    const hospitalA = await hospitalId(A);
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'ของ รพ.เอ',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updatePatientConsult(db, created.consult.id, {
      hospitalId: await hospitalId(B),
      role: 'NURSE',
      userCid: null,
      name: null,
    }, { status: 'COMPLETED' });

    expect(updated.ok).toBe(false);
    if (updated.ok) return;
    expect(updated.status).toBe(403);
  });

  it('refuses a status that is not a consult state', async () => {
    const hospitalA = await hospitalId(A);
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: hospitalA,
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-a-1',
      reason: 'ขอความเห็น',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = await updatePatientConsult(db, created.consult.id, {
      hospitalId: hospitalA,
      role: 'NURSE',
      userCid: null,
      name: null,
    }, { status: 'WHATEVER' as never });

    expect(updated.ok).toBe(false);
  });
});

describe('resolveConsultTarget', () => {
  it('finds the admission and the hospital that holds it', async () => {
    const target = await resolveConsultTarget(db, AN, A);

    expect(target).not.toBeNull();
    expect(target?.hospital_id).toBe(await hospitalId(A));
  });

  it('does not find an admission under the wrong hospital code', async () => {
    const target = await resolveConsultTarget(db, AN, B);

    expect(target).toBeNull();
  });
});

// ─── HUB consults — the question sent UP to the provincial hub ──────────────
//
// A community hospital's care team sends the question to the provincial hub
// hospital's registered OB-GYN team. The requester only progresses it; a
// clinician of the hub hospital answers it in the system.
describe('HUB consults (ปรึกษาขึ้นสู่โรงพยาบาลแม่ข่าย)', () => {
  const HUB = '10716'; // the PROVINCIAL_HUB of the seeded network

  async function seedHubPatient(an: string): Promise<string> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients
         (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'enc-name', 30, '2026-11-19T00:00:00Z', 'ACTIVE', ?, ?, ?)`,
      [`p-${an}`, await hospitalId(HUB), `HN-${an}`, an, now, now, now],
    );
    return `p-${an}`;
  }

  async function seedPatientForA(): Promise<void> {
    // The patient at A already exists (seeded in beforeEach).
  }

  it('sends the question to the hub and records it as a HUB consult', async () => {
    await seedDoctor(HUB, 'doc-hub-1', { name: 'ศูติแพทย์ รพ.น่าน' });

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
      requestedByName: 'พว.ท่าวังผา',
    });

    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.consult.consultScope).toBe('HUB');
    expect(created.consult.targetHospitalId).toBe(await hospitalId(HUB));
    expect(created.consult.targetHospitalName).toBe('โรงพยาบาลน่าน');
    expect(created.consult.urgencyLevel).toBe('URGENT');
    expect(created.consult.doctorName).toBe('ศูติแพทย์ รพ.น่าน');
    expect(created.consult.status).toBe('REQUESTED');
  });

  it('refuses a HUB consult for a patient already at the hub', async () => {
    const hubPatientAn = 'AN-AT-HUB';
    await seedHubPatient(hubPatientAn);

    await seedDoctor(HUB, 'doc-hub-2');
    const created = await createPatientConsult(db, {
      an: hubPatientAn,
      hospitalId: await hospitalId(HUB),
      patientId: `p-${hubPatientAn}`,
      journeyId: null,
      doctorId: 'doc-hub-2',
      reason: 'ปรึกษาขึ้นไปได้อย่างไร',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(400);
  });

  it('refuses an urgency that is not one of the three levels', async () => {
    await seedDoctor(HUB, 'doc-hub-3');
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-3',
      reason: 'ขอความเห็น',
      mode: 'HUB',
      urgency: 'WHENEVER' as never,
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(400);
  });

  it('refuses a HUB consult when the hub has no registered doctor', async () => {
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-nobody',
      reason: 'ขอความเห็น',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });

    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.status).toBe(400);
  });

  it('lets the requester progress the status but not write the advice', async () => {
    await seedDoctor(HUB, 'doc-hub-4');
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-4',
      reason: 'ความดันสูง',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const progressed = await updatePatientConsult(db, created.consult.id, {
      hospitalId: await hospitalId(A),
      role: 'NURSE',
      userCid: null,
      name: null,
    }, { status: 'CONTACTED', advice: 'จดเองไม่ได้' });

    expect(progressed.ok).toBe(false);
    if (progressed.ok) return;
    expect(progressed.status).toBe(403);

    const statusOnly = await updatePatientConsult(db, created.consult.id, {
      hospitalId: await hospitalId(A),
      role: 'NURSE',
      userCid: null,
      name: null,
    }, { status: 'CONTACTED' });
    expect(statusOnly.ok).toBe(true);
  });

  it('lets a clinician of the hub answer it, recording who answered', async () => {
    await seedDoctor(HUB, 'doc-hub-5', { name: 'ศูติแพทย์ รพ.น่าน' });
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-5',
      reason: 'ความดันสูง',
      mode: 'HUB',
      urgency: 'URGENT',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const answered = await updatePatientConsult(db, created.consult.id, {
      hospitalId: await hospitalId(HUB),
      role: 'OBSTETRICIAN',
      userCid: '1100700200001',
      name: 'นพ.สูติศาสตร์',
    }, {
      status: 'COMPLETED',
      advice: 'ให้ยาลดความดันและประเมินส่งต่อ',
    });

    expect(answered.ok).toBe(true);
    if (!answered.ok) return;
    expect(answered.consult.status).toBe('COMPLETED');
    expect(answered.consult.advice).toBe('ให้ยาลดความดันและประเมินส่งต่อ');
    expect(answered.consult.answeredByName).toBe('นพ.สูติศาสตร์');
    expect(answered.consult.consultedAt).not.toBeNull();
  });

  it('refuses a third hospital from answering the HUB consult', async () => {
    await seedDoctor(HUB, 'doc-hub-6');
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-6',
      reason: 'ขอความเห็น',
      mode: 'HUB',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const answered = await updatePatientConsult(db, created.consult.id, {
      hospitalId: await hospitalId(B),
      role: 'OBSTETRICIAN',
      userCid: null,
      name: null,
    }, { status: 'COMPLETED', advice: 'ไม่มีสิทธิ์' });

    expect(answered.ok).toBe(false);
    if (answered.ok) return;
    expect(answered.status).toBe(403);
  });

  it('shows the hub consult only in the hub inbox', async () => {
    await seedDoctor(HUB, 'doc-hub-7');
    const created = await createPatientConsult(db, {
      an: AN,
      hospitalId: await hospitalId(A),
      patientId: `p-${AN}`,
      journeyId: null,
      doctorId: 'doc-hub-7',
      reason: 'ความดันสูง',
      mode: 'HUB',
      urgency: 'EMERGENCY',
      requestedByCid: null,
      requestedByName: null,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const hubInbox = await listHubConsultInbox(db, await hospitalId(HUB));
    expect(hubInbox).toHaveLength(1);
    expect(hubInbox[0].id).toBe(created.consult.id);
    expect(hubInbox[0].requesterHospitalName).toContain('บ้านไผ่');

    const otherInbox = await listHubConsultInbox(db, await hospitalId(B));
    expect(otherInbox).toHaveLength(0);

    expect(await countPendingHubConsults(db, await hospitalId(HUB))).toBe(1);
    expect(await countPendingHubConsults(db, await hospitalId(B))).toBe(0);
  });
});
