// The referral board is province-wide, so a referral's diagnosis code must not
// tell a hospital with no care link to the woman that she has HIV or syphilis.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../../helpers/testDb';
import { testSessionUser } from '../../helpers/session';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET as listGet } from '@/app/api/dashboard/referrals/list/route';
import { GET as detailGet } from '@/app/api/dashboard/referrals/[id]/route';

const REGISTERING = { id: '00000000-0000-4000-8000-0000000000e1', hcode: '99931' };
const UNRELATED = { id: '00000000-0000-4000-8000-0000000000e2', hcode: '99932' };
const REFERRED_TO = { id: '00000000-0000-4000-8000-0000000000e3', hcode: '99933' };
const SENDER = { id: '00000000-0000-4000-8000-0000000000e4', hcode: '99934' };
const RESTRICTED = 'B20';

interface ReferralBody {
  id: string;
  diagnosisCode: string | null;
}

function callList(query = '') {
  return listGet(new NextRequest(`http://localhost/api/dashboard/referrals/list${query}`));
}

function callDetail(id: string) {
  return detailGet(new NextRequest(`http://localhost/api/dashboard/referrals/${id}`), {
    params: Promise.resolve({ id }),
  });
}

async function codeFromList(id: string): Promise<string | null> {
  const body = (await (await callList()).json()) as { referrals: ReferralBody[] };
  const row = body.referrals.find((r) => r.id === id);
  if (!row) throw new Error(`referral ${id} missing from the list`);
  return row.diagnosisCode;
}

async function codeFromDetail(id: string): Promise<string | null> {
  const body = (await (await callDetail(id)).json()) as { referral: ReferralBody };
  return body.referral.diagnosisCode;
}

function signInAt(hcode: string, extra: Record<string, unknown> = {}) {
  mockSessionUser = { ...testSessionUser({ hospitalCode: hcode }), ...extra };
}

async function addJourney(hospitalId: string): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, anc_risk_level, anc_visit_count, ga_weeks, registered_at, stage_changed_at, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 30, 1, 0, 'PREGNANCY', 'LOW', 0, 36, ?, ?, ?, ?, ?)`,
    [
      id,
      hospitalId,
      hospitalId,
      `HN-${id.slice(0, 8)}`,
      'นาง ทดสอบ',
      `enc_${id.slice(0, 8)}`,
      `hash_${id.slice(0, 8)}`,
      now,
      now,
      now,
      now,
      now,
    ],
  );
  return id;
}

async function addReferral(
  journeyId: string,
  from: string,
  to: string,
  status: string,
  code: string | null = RESTRICTED,
): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_referrals
       (id, journey_id, from_hospital_id, to_hospital_id, status, urgency_level, reason, diagnosis_code, initiated_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ROUTINE', 'x', ?, ?, ?, ?)`,
    [id, journeyId, from, to, status, code, now, now, now],
  );
  return id;
}

describe('dashboard referral routes — HIV and syphilis diagnosis codes', () => {
  let journeyId: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = await createTestDb();
    const now = new Date().toISOString();
    for (const h of [REGISTERING, UNRELATED, REFERRED_TO, SENDER]) {
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
         VALUES (?, ?, ?, 'F1', true, 'ONLINE', ?, ?)`,
        [h.id, h.hcode, `รพ.${h.hcode}`, now, now],
      );
    }
    journeyId = await addJourney(REGISTERING.id);
    mockSessionUser = null;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  describe.each([
    ['list', codeFromList],
    ['detail', codeFromDetail],
  ] as const)('%s route', (_name, readCode) => {
    it('shows the registering hospital the code', async () => {
      const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
      signInAt(REGISTERING.hcode);
      expect(await readCode(id)).toBe(RESTRICTED);
    });

    it.each([['INITIATED'], ['ACCEPTED'], ['IN_TRANSIT'], ['ARRIVED']])(
      'shows the destination of a %s referral the code',
      async (status) => {
        const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, status);
        signInAt(REFERRED_TO.hcode);
        expect(await readCode(id)).toBe(RESTRICTED);
      },
    );

    it.each([['B20'], ['b20.9'], ['Z21'], ['O98.7'], ['A53.9'], ['O24.4, B20']])(
      'blanks %s for an unrelated hospital',
      async (code) => {
        const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED', code);
        signInAt(UNRELATED.hcode);
        expect(await readCode(id)).toBeNull();
      },
    );

    it('keeps an unrelated diagnosis for an unrelated hospital', async () => {
      const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED', 'O24.4');
      signInAt(UNRELATED.hcode);
      expect(await readCode(id)).toBe('O24.4');
    });

    it.each([['REJECTED'], ['EXPIRED']])('gives a %s destination no access', async (status) => {
      const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, status);
      signInAt(REFERRED_TO.hcode);
      expect(await readCode(id)).toBeNull();
    });

    it('gives a sender that did not register her no access, as the journey page does', async () => {
      const id = await addReferral(journeyId, SENDER.id, REFERRED_TO.id, 'ACCEPTED');
      signInAt(SENDER.hcode);
      expect(await readCode(id)).toBeNull();
    });

    it('does not count a referral a hospital made to itself', async () => {
      const id = await addReferral(journeyId, UNRELATED.id, UNRELATED.id, 'ACCEPTED');
      signInAt(UNRELATED.hcode);
      expect(await readCode(id)).toBeNull();
    });

    it.each([
      ['ADMIN', { role: 'ADMIN' }],
      ['a read-only unit', { accessMode: 'readonly' }],
      ['a session with no hospital', { hospitalCode: undefined }],
    ])('gives %s no bypass', async (_label, extra) => {
      const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
      signInAt(UNRELATED.hcode, extra);
      expect(await readCode(id)).toBeNull();
    });
  });

  it('decides each row by its own journey', async () => {
    const theirs = await addJourney(UNRELATED.id);
    const hidden = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
    const shown = await addReferral(theirs, UNRELATED.id, REFERRED_TO.id, 'ACCEPTED');
    signInAt(UNRELATED.hcode);
    expect(await codeFromList(hidden)).toBeNull();
    expect(await codeFromList(shown)).toBe(RESTRICTED);
  });

  it('blanks the code on the search path too', async () => {
    const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
    signInAt(UNRELATED.hcode);
    const res = await callList('?q=HN-');
    const text = await res.clone().text();
    expect(text).toContain(id);
    expect(text).not.toContain(RESTRICTED);
  });

  it('does not mark which rows were withheld, since that would reveal the diagnosis', async () => {
    const restricted = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
    const empty = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED', null);
    signInAt(UNRELATED.hcode);
    const body = (await (await callList()).json()) as { referrals: ReferralBody[] };
    const fieldsOf = (id: string) =>
      Object.entries(body.referrals.find((r) => r.id === id) ?? {}).filter(
        ([key]) => !['id', 'initiatedAt'].includes(key),
      );
    expect(fieldsOf(restricted)).toEqual(fieldsOf(empty));
  });

  it('rejects a request with no session on both routes', async () => {
    const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
    for (const res of [await callList(), await callDetail(id)]) {
      expect(res.status).toBe(401);
      expect(await res.text()).not.toContain(RESTRICTED);
    }
  });

  it('still returns 404 for an unknown referral', async () => {
    signInAt(REGISTERING.hcode);
    expect((await callDetail(uuidv4())).status).toBe(404);
  });

  it('keeps both responses out of shared caches', async () => {
    const id = await addReferral(journeyId, REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
    signInAt(REGISTERING.hcode);
    for (const res of [await callList(), await callDetail(id)]) {
      expect(res.headers.get('cache-control')).toContain('no-store');
    }
  });
});
