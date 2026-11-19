// The refer-out rule: a hospital keeps the women it referred away.
//
// The rules under test:
//   1. A woman A registered and referred out to B stays in A's ANC registry —
//      A can still track her (the "ส่งต่อไป รพ.บี" case). The console's
//      counts must count the same women its list shows.
//   2. A never sees B's other women.
//   3. A can still open the journey of the woman she referred out.
//   4. A viewer whose hospital is not registered sees NOTHING — the scope
//      fails closed, and the answer says why instead of claiming a lack of
//      permission.
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
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => undefined }));

import { GET as hospitalJourneysRoute } from '@/app/api/hospitals/[hcode]/journeys/route';
import { GET as dashboardRoute } from '@/app/api/dashboard/route';
import { GET as hospitalPatientsRoute } from '@/app/api/hospitals/[hcode]/patients/route';
import { GET as journeysRoute } from '@/app/api/journeys/route';
import { GET as journeyDetailRoute } from '@/app/api/journeys/[journeyId]/route';
import type { JourneyListResponse } from '@/types/api';

// รพ.บ้านไผ่ — sends the woman away
const SENDER_HCODE = '11002';
// รพ.พล — receives her
const RECEIVER_HCODE = '11004';

const SENT_JOURNEY = 'journey-sent-out';
const KEPT_JOURNEY = 'journey-still-here';
const RECEIVER_JOURNEY = 'journey-receiver-other';

async function hospitalId(hcode: string): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

async function seedJourney(
  id: string,
  registeredAt: string,
  currentAt: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO maternal_journeys
       (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para,
        care_stage, registered_at, stage_changed_at, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 'enc-cid', ?, 30, 1, 0, 'PREGNANCY', ?, ?, ?, ?, ?)`,
    [
      id,
      await hospitalId(registeredAt),
      await hospitalId(currentAt),
      `HN-${id.replace('journey-', '')}`,
      `hash-${id.replace('journey-', '')}`,
      now,
      now,
      now,
      now,
      now,
    ],
  );
}

async function seedPatient(hcode: string, an: string, journeyId: string | null): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date, labor_status, journey_id, synced_at, created_at, updated_at)
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
    `INSERT INTO cached_referrals
       (id, journey_id, from_hospital_id, to_hospital_id, status, reason, initiated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ส่งต่อ', ?, ?, ?)`,
    [
      `r-${journeyId}`,
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

  // A registered a woman and referred her to B: the journey moved, the
  // pregnancy stayed registered at A.
  await seedJourney(SENT_JOURNEY, SENDER_HCODE, RECEIVER_HCODE);
  await seedPatient(SENDER_HCODE, 'AN-SENT', SENT_JOURNEY);
  await seedReferral(SENT_JOURNEY, SENDER_HCODE, RECEIVER_HCODE, 'ARRIVED');

  // A's other woman never left.
  await seedJourney(KEPT_JOURNEY, SENDER_HCODE, SENDER_HCODE);
  await seedPatient(SENDER_HCODE, 'AN-KEPT', KEPT_JOURNEY);

  // B's own woman — A must never see her.
  await seedJourney(RECEIVER_JOURNEY, RECEIVER_HCODE, RECEIVER_HCODE);
  await seedPatient(RECEIVER_HCODE, 'AN-RECEIVER', RECEIVER_JOURNEY);
});

describe('refer-out: the sender keeps the woman it referred away', () => {
  it('lists the woman she referred out, marked as sent away', async () => {
    signInAs(SENDER_HCODE);

    const res = await hospitalJourneysRoute(
      new NextRequest(`http://localhost/api/hospitals/${SENDER_HCODE}/journeys`) as never,
      { params: Promise.resolve({ hcode: SENDER_HCODE }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyListResponse;

    // Both of A's women — the one that went to B is still A's to track.
    expect(body.pagination.total).toBe(2);
    const sent = body.journeys.find((j) => j.id === SENT_JOURNEY);
    expect(sent).toBeDefined();
    expect(sent?.referredOut).toBe(true);
    expect(sent?.currentHospitalName).toBeTruthy();
    // B's other woman is not on A's list.
    expect(body.journeys.find((j) => j.id === RECEIVER_JOURNEY)).toBeUndefined();
  });

  it('counts the same women its list shows', async () => {
    signInAs(SENDER_HCODE);

    const res = await hospitalJourneysRoute(
      new NextRequest(`http://localhost/api/hospitals/${SENDER_HCODE}/journeys`) as never,
      { params: Promise.resolve({ hcode: SENDER_HCODE }) },
    );
    const body = (await res.json()) as JourneyListResponse;

    // The KPI strip must not count fewer women than the table lists.
    expect(body.counts?.total).toBe(body.pagination.total);
  });

  it('still opens the journey of the woman she referred out', async () => {
    signInAs(SENDER_HCODE);

    const res = await journeyDetailRoute(
      new NextRequest(`http://localhost/api/journeys/${SENT_JOURNEY}`) as never,
      { params: Promise.resolve({ journeyId: SENT_JOURNEY }) },
    );

    expect(res.status).toBe(200);
  });

  it('does not put the receiver’s other women on the sender’s list', async () => {
    signInAs(SENDER_HCODE);

    const res = await hospitalJourneysRoute(
      new NextRequest(`http://localhost/api/hospitals/${SENDER_HCODE}/journeys`) as never,
      { params: Promise.resolve({ hcode: SENDER_HCODE }) },
    );
    const body = (await res.json()) as JourneyListResponse;

    expect(body.journeys.map((j) => j.id)).not.toContain(RECEIVER_JOURNEY);
  });
});

describe('the numbers are aggregates and stay visible', () => {
  it('shows the dashboard counts to a hospital user', async () => {
    // A count carries no patient identity — the scope hides the DETAILS, not
    // the numbers. A dashboard that shows no numbers at all is wrong.
    signInAs(SENDER_HCODE);

    const res = await dashboardRoute();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.summary.totalActive).toBeGreaterThan(0);
    expect(body.hospitals.length).toBeGreaterThan(0);
  });
});

describe('a hospital that is not registered', () => {
  it('sees no journey at all — the scope fails closed', async () => {
    // An account with no hospital row must not read the province's registry.
    signInAs('99999');

    const res = await journeysRoute(new NextRequest('http://localhost/api/journeys') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as JourneyListResponse;

    expect(body.pagination.total).toBe(0);
    expect(body.journeys).toHaveLength(0);
  });

  it('is told the hospital is not registered — not that it lacks permission', async () => {
    // The old answer said "คุณไม่มีสิทธิ์ดูข้อมูลคนไข้ของโรงพยาบาลนี้" for its OWN
    // hospital — wrong, and it left the admin with no idea what to do.
    signInAs('99999');

    const res = await hospitalPatientsRoute(
      new NextRequest(`http://localhost/api/hospitals/${SENDER_HCODE}/patients`) as never,
      { params: Promise.resolve({ hcode: SENDER_HCODE }) },
    );

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('HOSPITAL_NOT_REGISTERED');
    expect(body.suggestedAction).toBeTruthy();
  });
});
