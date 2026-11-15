// The journey pages are province-wide, so this route must not hand HIV or
// syphilis status, in any form, to a hospital with no care link to the woman.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../../helpers/testDb';
import { testSessionUser } from '../../helpers/session';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import { insertAncScreeningIfChanged } from '@/services/anc-screening';
import type { SseManager } from '@/lib/sse';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET } from '@/app/api/journeys/[journeyId]/route';

const REGISTERING = { id: '00000000-0000-4000-8000-0000000000d1', hcode: '99921' };
const UNRELATED = { id: '00000000-0000-4000-8000-0000000000d2', hcode: '99922' };
const REFERRED_TO = { id: '00000000-0000-4000-8000-0000000000d3', hcode: '99923' };
const VISITED = { id: '00000000-0000-4000-8000-0000000000d4', hcode: '99924' };
const HIV_SECRET = 'Reactive-hiv-secret';
const VDRL_SECRET = 'Reactive-vdrl-secret';
const SEROLOGY_RULES = ['hr2_hiv', 'hr2_syphilis', 'รายการเสี่ยงรหัส 23', 'รายการเสี่ยงรหัส 24'];
const OTHER_RULES = ['hr2_hbsag', 'เบาหวาน'];

const sse = { broadcast(): void {} } as unknown as SseManager;

interface DetailBody {
  journey: { hivResult: string | null; vdrlResult: string | null; hbsagResult: string | null };
  latestRisk: { triggeredRules: string[] } | null;
  serologyWithheld: boolean;
}

function call(journeyId: string) {
  return GET(new NextRequest(`http://localhost/api/journeys/${journeyId}`), {
    params: Promise.resolve({ journeyId }),
  });
}

function signInAt(hcode: string, extra: Record<string, unknown> = {}) {
  mockSessionUser = { ...testSessionUser({ hospitalCode: hcode }), ...extra };
}

describe('GET /api/journeys/[journeyId] — HIV and syphilis visibility', () => {
  let journeyId: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = await createTestDb();
    const now = new Date().toISOString();
    for (const h of [REGISTERING, UNRELATED, REFERRED_TO, VISITED]) {
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
         VALUES (?, ?, ?, 'F1', true, 'ONLINE', ?, ?)`,
        [h.id, h.hcode, `รพ.${h.hcode}`, now, now],
      );
    }
    await processAncWebhook(
      db,
      REGISTERING.id,
      {
        type: 'anc_data',
        hospitalCode: REGISTERING.hcode,
        patients: [
          {
            hn: 'HN-S1',
            name: 'นาง ทดสอบ เซรุ่ม',
            cid: '1100500090006',
            birthday: '1994-02-01',
            pregNo: 1,
            lmp: '2026-01-01T00:00:00Z',
          },
        ],
      } as WebhookAncPayload,
      sse,
    );
    journeyId = (await db.query<{ id: string }>('SELECT id FROM maternal_journeys'))[0].id;
    await db.execute(
      `UPDATE maternal_journeys SET hiv_result = ?, vdrl_result = ?, hbsag_result = 'NEG'`,
      [HIV_SECRET, VDRL_SECRET],
    );
    await insertAncScreeningIfChanged(db, journeyId, {
      level: 'HR2',
      triggeredRulesJson: JSON.stringify([...SEROLOGY_RULES, ...OTHER_RULES]),
      riskFactorsJson: JSON.stringify({ itemIds: [24] }),
      recommendedFacility: null,
      recommendedProvider: null,
    });
    mockSessionUser = null;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  async function addReferral(from: string, to: string, status: string) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_referrals
         (id, journey_id, from_hospital_id, to_hospital_id, status, urgency_level, reason, initiated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'ROUTINE', 'x', ?, ?, ?)`,
      [uuidv4(), journeyId, from, to, status, now, now, now],
    );
  }

  async function addVisit(hospitalId: string) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_anc_visits (id, journey_id, hospital_id, visit_date, visit_number, synced_at, created_at)
       VALUES (?, ?, ?, ?, 2, ?, ?)`,
      [uuidv4(), journeyId, hospitalId, '2026-03-01', now, now],
    );
  }

  async function expectWithheld() {
    const res = await call(journeyId);
    expect(res.status).toBe(200);
    const text = await res.clone().text();
    expect(text).not.toContain(HIV_SECRET);
    expect(text).not.toContain(VDRL_SECRET);
    for (const rule of SEROLOGY_RULES) expect(text).not.toContain(rule);
    const body = (await res.json()) as DetailBody;
    expect(body.journey.hivResult).toBeNull();
    expect(body.journey.vdrlResult).toBeNull();
    expect(body.serologyWithheld).toBe(true);
    return body;
  }

  async function expectVisible() {
    const body = (await (await call(journeyId)).json()) as DetailBody;
    expect(body.journey.hivResult).toBe(HIV_SECRET);
    expect(body.journey.vdrlResult).toBe(VDRL_SECRET);
    expect(body.serologyWithheld).toBe(false);
    expect(body.latestRisk?.triggeredRules).toEqual([...SEROLOGY_RULES, ...OTHER_RULES]);
  }

  it('rejects a request with no session and reveals nothing', async () => {
    const res = await call(journeyId);
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain(HIV_SECRET);
  });

  it('returns 404 for an unknown journey', async () => {
    signInAt(REGISTERING.hcode);
    expect((await call('00000000-0000-4000-8000-00000000dead')).status).toBe(404);
  });

  it('shows the registering hospital everything, uncached', async () => {
    signInAt(REGISTERING.hcode);
    await expectVisible();
    expect((await call(journeyId)).headers.get('cache-control')).toContain('no-store');
  });

  it.each([['INITIATED'], ['ACCEPTED'], ['IN_TRANSIT'], ['ARRIVED']])(
    'shows the destination of a %s referral everything',
    async (status) => {
      await addReferral(REGISTERING.id, REFERRED_TO.id, status);
      signInAt(REFERRED_TO.hcode);
      await expectVisible();
    },
  );

  it('withholds serology from an unrelated hospital but keeps the rest', async () => {
    signInAt(UNRELATED.hcode);
    const body = await expectWithheld();
    expect(body.journey.hbsagResult).toBe('NEG');
    expect(body.latestRisk?.triggeredRules).toEqual(OTHER_RULES);
  });

  describe('referral diagnosis codes', () => {
    async function referralCode(code: string) {
      await addReferral(REGISTERING.id, REFERRED_TO.id, 'ACCEPTED');
      await db.execute('UPDATE cached_referrals SET diagnosis_code = ?', [code]);
      const body = (await (await call(journeyId)).json()) as {
        referrals: { diagnosisCode: string | null }[];
      };
      return body.referrals[0].diagnosisCode;
    }

    it.each([
      ['B20'],
      ['B24'],
      ['b20.9'],
      ['Z21'],
      ['R75'],
      ['O98.7'],
      ['A50.0'],
      ['A53.9'],
      ['O98.1'],
    ])('blanks %s for a hospital without full access', async (code) => {
      signInAt(UNRELATED.hcode);
      expect(await referralCode(code)).toBeNull();
    });

    it.each([['O24.4, B20'], ['O24/B20'], ['O24 B20'], ['see B20'], ['O24.4.B20'], ['O244B20']])(
      'blanks %s because it is not one well-formed code',
      async (code) => {
        signInAt(UNRELATED.hcode);
        expect(await referralCode(code)).toBeNull();
      },
    );

    it.each([['O24.4'], ['O14.1'], ['B18.1'], ['A49.9'], ['O98.4'], ['O244'], ['O24']])(
      'keeps the unrelated code %s',
      async (code) => {
        signInAt(UNRELATED.hcode);
        expect(await referralCode(code)).toBe(code);
      },
    );

    it('keeps the code for a hospital with full access', async () => {
      signInAt(REGISTERING.hcode);
      expect(await referralCode('B20')).toBe('B20');
    });
  });

  it('withholds serology from a hospital with only its own records', async () => {
    await addVisit(VISITED.id);
    signInAt(VISITED.hcode);
    await expectWithheld();
  });

  it.each([['REJECTED'], ['EXPIRED']])('gives a %s referral no access', async (status) => {
    await addReferral(REGISTERING.id, REFERRED_TO.id, status);
    signInAt(REFERRED_TO.hcode);
    await expectWithheld();
  });

  it('does not count a referral a hospital made to itself', async () => {
    await addReferral(UNRELATED.id, UNRELATED.id, 'ACCEPTED');
    signInAt(UNRELATED.hcode);
    await expectWithheld();
  });

  it.each([
    ['ADMIN', { role: 'ADMIN' }],
    ['a read-only unit', { accessMode: 'readonly' }],
  ])('gives %s from an unrelated hospital no bypass', async (_label, extra) => {
    signInAt(UNRELATED.hcode, extra);
    await expectWithheld();
  });

  it('withholds serology from the exempt system hcode', async () => {
    signInAt('99999');
    await expectWithheld();
  });

  it('withholds serology from a session with no hospital code', async () => {
    signInAt(UNRELATED.hcode, { hospitalCode: undefined });
    await expectWithheld();
  });

  it('records in the audit log whether serology was withheld', async () => {
    signInAt(UNRELATED.hcode);
    await call(journeyId);
    signInAt(REGISTERING.hcode);
    await call(journeyId);
    const rows = await db.query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM audit_logs WHERE action = 'VIEW_JOURNEY' ORDER BY created_at`,
    );
    const flags = rows.map((r) => {
      const m = typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata;
      return (m as { serologyWithheld: boolean }).serologyWithheld;
    });
    expect(flags.sort()).toEqual([false, true]);
  });
});
