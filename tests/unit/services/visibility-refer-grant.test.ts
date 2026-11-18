// The refer-in grant: a hospital sees a patient of ANOTHER hospital when
// that hospital referred the patient in to it.
//
// The referral rows are the ones the app builds from HOSxP's referin /
// referout tables (src/services/sync/referrals.ts), so this test seeds the
// same shape: a cached_referrals row whose journey is the origin hospital's
// pregnancy and whose destination is the receiving hospital.
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

import { GET as patientDetailRoute } from '@/app/api/patients/[an]/route';
import { GET as highRiskRoute } from '@/app/api/dashboard/high-risk/route';
import { GET as journeysRoute } from '@/app/api/journeys/route';
import { GET as journeyDetailRoute } from '@/app/api/journeys/[journeyId]/route';

// รพ.พล — the hospital that receives the referral
const RECEIVER_HCODE = '11004';
// รพ.บ้านไผ่ — the hospital that sends the patient
const SENDER_HCODE = '11002';

const JOURNEY_ID = 'journey-refer-1';
const SENT_AN = 'AN-SENT';
const UNSENT_AN = 'AN-UNSENT';
const RECEIVER_AN = 'AN-RECEIVER';

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedJourneyAt(hcode: string, id: string, hn: string): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, registered_at, stage_changed_at, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 'enc-cid', ?, 30, 1, 0, 'PREGNANCY', ?, ?, ?, ?, ?)`,
    [
      id,
      await hospitalId(hcode),
      await hospitalId(hcode),
      hn,
      `hash-${id}`,
      now,
      now,
      now,
      now,
      now,
    ],
  );
}

async function seedPatientAt(hcode: string, an: string, journeyId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, journey_id, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, ?, 'ACTIVE', ?, ?, ?, ?)`,
    [
      `p-${an}`,
      await hospitalId(hcode),
      `HN-${an}`,
      an,
      now,
      journeyId,
      now,
      now,
      now,
    ],
  );
}

async function seedReferral(
  journeyId: string,
  fromHcode: string,
  toHcode: string,
  status: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_referrals (id, journey_id, from_hospital_id, to_hospital_id, status, reason, initiated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ส่งต่อ', ?, ?, ?)`,
    [
      `r-${journeyId}-${status}`,
      journeyId,
      await hospitalId(fromHcode),
      await hospitalId(toHcode),
      status,
      now,
      now,
      now,
    ],
  );
}

function signInAs(hcode: string): void {
  mockSessionUser = testSessionUser({ hospitalCode: hcode }) as unknown as Record<string, unknown>;
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = null;

  // A pregnancy at the sending hospital, referred in to the receiver.
  await seedJourneyAt(SENDER_HCODE, JOURNEY_ID, 'HN-SENT');
  await seedPatientAt(SENDER_HCODE, SENT_AN, JOURNEY_ID);
  await seedReferral(JOURNEY_ID, SENDER_HCODE, RECEIVER_HCODE, 'INITIATED');

  // A pregnancy at the sending hospital with no referral at all.
  await seedJourneyAt(SENDER_HCODE, 'journey-unrelated', 'HN-UNSENT');
  await seedPatientAt(SENDER_HCODE, UNSENT_AN, 'journey-unrelated');
});

describe('refer-in grant', () => {
  it('serves the receiver the patient that was referred in to it', async () => {
    signInAs(RECEIVER_HCODE);
    const res = await patientDetailRoute(
      new NextRequest(`http://localhost/api/patients/${SENDER_HCODE}-${SENT_AN}`),
      { params: Promise.resolve({ an: `${SENDER_HCODE}-${SENT_AN}` }) },
    );
    expect(res.status).toBe(200);
  });

  it('still refuses a patient of another hospital with no referral', async () => {
    signInAs(RECEIVER_HCODE);
    const res = await patientDetailRoute(
      new NextRequest(`http://localhost/api/patients/${SENDER_HCODE}-${UNSENT_AN}`),
      { params: Promise.resolve({ an: `${SENDER_HCODE}-${UNSENT_AN}` }) },
    );
    expect(res.status).toBe(403);
  });

  it('puts the referred-in patient on the receiver\'s labor roster', async () => {
    signInAs(RECEIVER_HCODE);
    const res = await highRiskRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.patients.map((p: { an: string }) => p.an)).toContain(SENT_AN);
  });

  it('leaves the referred-in journey out of a third hospital\'s registry', async () => {
    signInAs('10998'); // รพ.ชุมแพ — neither party
    const res = await journeysRoute(
      new NextRequest('http://localhost/api/journeys?stage=PREGNANCY'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.journeys.map((j: { id: string }) => j.id)).not.toContain(JOURNEY_ID);
  });

  it('shows the referred-in journey in the receiver\'s registry', async () => {
    signInAs(RECEIVER_HCODE);
    const res = await journeysRoute(
      new NextRequest('http://localhost/api/journeys?stage=PREGNANCY'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.journeys.map((j: { id: string }) => j.id)).toContain(JOURNEY_ID);
  });

  it('hides the journey detail from a third hospital', async () => {
    signInAs('10998'); // รพ.ชุมแพ — neither party
    const res = await journeyDetailRoute(
      new NextRequest(`http://localhost/api/journeys/${JOURNEY_ID}`),
      { params: Promise.resolve({ journeyId: JOURNEY_ID }) },
    );
    expect(res.status).toBe(404);
  });

  it('serves the journey detail to the receiver', async () => {
    signInAs(RECEIVER_HCODE);
    const res = await journeyDetailRoute(
      new NextRequest(`http://localhost/api/journeys/${JOURNEY_ID}`),
      { params: Promise.resolve({ journeyId: JOURNEY_ID }) },
    );
    expect(res.status).toBe(200);
  });

  it('does not grant the sender the receiver\'s other patients', async () => {
    // A patient of the receiver with no referral in either direction.
    await seedPatientAt(RECEIVER_HCODE, RECEIVER_AN, null);
    signInAs(SENDER_HCODE);
    const res = await highRiskRoute();
    expect(res.status).toBe(200);
    const body = await res.json();
    const roster = body.patients.map((p: { an: string }) => p.an);
    // The sender sees its own two patients — and nothing of the receiver's.
    expect(new Set(roster)).toEqual(new Set([SENT_AN, UNSENT_AN]));
    expect(roster).not.toContain(RECEIVER_AN);
  });

  it('closes the grant once the referral is rejected', async () => {
    await db.execute('UPDATE cached_referrals SET status = ? WHERE journey_id = ?', [
      'REJECTED',
      JOURNEY_ID,
    ]);
    signInAs(RECEIVER_HCODE);
    const res = await patientDetailRoute(
      new NextRequest(`http://localhost/api/patients/${SENDER_HCODE}-${SENT_AN}`),
      { params: Promise.resolve({ an: `${SENDER_HCODE}-${SENT_AN}` }) },
    );
    expect(res.status).toBe(403);
  });
});
