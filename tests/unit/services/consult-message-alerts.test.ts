// The consult_message LINE producer — a new thread message tells the OTHER
// side's opted-in roster (CID-keyed) that someone is talking, via the same
// moph alert pipeline every other event rides.
//
// Pinned here:
//   1. Rows land under the RECEIVING hospital's id (the other side for HUB,
//      the hospital itself for INTERNAL), sender's CID excluded.
//   2. rule_id is the MESSAGE id — the dedup index is day-granular, and a
//      conversation must never collapse into one LINE per day.
//   3. severity 'notify' + the consult_message source; never a risk color.
//   4. Best effort: alerts disabled (or the whole pipeline off) leaves the
//      message itself untouched.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { upsertNotificationPreference } from '@/services/notification-preference';
import {
  createConsultMessage,
  type CreateMessageResult,
} from '@/services/consult-messages';
import { createPatientConsult, type ConsultActor } from '@/services/consults';

// The producer encrypts the patient name at rest — same requirement the
// risk-alert tests carry.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

const A = '11002'; // the requesting hospital
const HUB = '10716'; // the PROVINCIAL_HUB of the seeded network
const AN = 'AN-ALERT-1';

let db: DatabaseAdapter;

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedDoctor(hcode: string, id: string, cid: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_consult_doctors
       (id, hospital_id, cid, name, position, phone_number, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'สูติแพทย์', '0800000000', true, ?, ?)`,
    [id, await hospitalId(hcode), cid, `แพทย์ ${id}`, now, now],
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

const requesterActor: ConsultActor = { hospitalId: '', role: 'NURSE', userCid: '1100200000001', name: 'พย.ต้นทาง' };
const hubDoctorActor: ConsultActor = { hospitalId: '', role: 'OBSTETRICIAN', userCid: '1100700000001', name: 'นพ.แม่ข่าย' };

const HUB_ROSTER_CID = '1100700000001';
const A_ROSTER_CID = '1100200000002';

let hubConsultId = '';
let internalConsultId = '';

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  await seedPatient(A, AN);

  // Rosters on both sides; both doctors opted in (a zero-children pref row
  // subscribes to every event — the startup backfill's default).
  await seedDoctor(HUB, 'doc-hub-1', HUB_ROSTER_CID);
  await seedDoctor(A, 'doc-a-1', A_ROSTER_CID);
  await upsertNotificationPreference(db, HUB_ROSTER_CID, HUB, true);
  await upsertNotificationPreference(db, A_ROSTER_CID, A, true);

  requesterActor.hospitalId = await hospitalId(A);
  hubDoctorActor.hospitalId = await hospitalId(HUB);

  const hub = await createPatientConsult(db, {
    an: AN,
    hospitalId: await hospitalId(A),
    patientId: `p-${AN}`,
    journeyId: null,
    doctorId: 'doc-hub-1',
    reason: 'ความดันสูง',
    mode: 'HUB',
    requestedByCid: requesterActor.userCid,
    requestedByName: requesterActor.name,
  });
  if (!hub.ok) throw new Error('the seeded HUB consult must create');
  hubConsultId = hub.consult.id;

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
  if (!internal.ok) throw new Error('the seeded INTERNAL consult must create');
  internalConsultId = internal.consult.id;
});

async function alertRows(): Promise<
  Array<{ hospital_id: string; recipient_cid: string; alert_source: string; severity: string; rule_id: string; title: string }>
> {
  return db.query(
    `SELECT hospital_id, recipient_cid, alert_source, severity, rule_id, title
       FROM moph_alert_log ORDER BY created_at, recipient_cid`,
  );
}

describe('enqueueConsultMessageAlert via createConsultMessage', () => {
  it('a requester message notifies the HUB roster, sender excluded', async () => {
    const sent: CreateMessageResult = await createConsultMessage(db, hubConsultId, requesterActor, {
      body: 'ผู้ป่วยชักค่ะ',
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const rows = await alertRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].hospital_id).toBe(await hospitalId(HUB)); // the other side
    expect(rows[0].recipient_cid).toBe(HUB_ROSTER_CID);
    expect(rows[0].recipient_cid).not.toBe(requesterActor.userCid);
    expect(rows[0].alert_source).toBe('consult_message');
    expect(rows[0].severity).toBe('notify');
    // rule_id carries the MESSAGE id — not the consult, not the day.
    expect(rows[0].rule_id).toBe(sent.message.id);
    expect(rows[0].title).toContain('ข้อความใหม่ในคำปรึกษา');
  });

  it('every message delivers its own row — a conversation never collapses into one LINE per day', async () => {
    const first = await createConsultMessage(db, hubConsultId, requesterActor, { body: 'หนึ่ง' });
    const second = await createConsultMessage(db, hubConsultId, hubDoctorActor, { body: 'สอง' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const rows = await alertRows();
    // Message 1 → hub roster (excl. requester); message 2 → requester's
    // roster (excl. hub doctor) — and the two rule_ids differ.
    expect(rows).toHaveLength(2);
    expect(rows[0].rule_id).toBe(first.message.id);
    expect(rows[1].rule_id).toBe(second.message.id);
    expect(rows[1].hospital_id).toBe(await hospitalId(A)); // the other side now
    expect(rows[1].recipient_cid).toBe(A_ROSTER_CID);
  });

  it('an INTERNAL message notifies the hospital itself, sender excluded', async () => {
    const sent = await createConsultMessage(db, internalConsultId, requesterActor, {
      body: 'ข้อความทีมภายใน',
    });
    expect(sent.ok).toBe(true);

    const rows = await alertRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].hospital_id).toBe(await hospitalId(A));
    expect(rows[0].recipient_cid).toBe(A_ROSTER_CID);
    expect(rows[0].recipient_cid).not.toBe(requesterActor.userCid);
  });

  it('alerts off leaves the message untouched — the pipeline is best effort', async () => {
    process.env.MOPH_ALERTS_ENABLED = 'false';
    try {
      const sent = await createConsultMessage(db, hubConsultId, requesterActor, { body: 'ข้อความ' });
      expect(sent.ok).toBe(true);
      expect(await alertRows()).toHaveLength(0);
    } finally {
      delete process.env.MOPH_ALERTS_ENABLED;
    }
  });
});
