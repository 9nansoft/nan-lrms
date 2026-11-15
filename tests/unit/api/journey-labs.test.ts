// The labs route hands out decrypted HIV and syphilis results, so who may read
// them, and that each read leaves an audit row, is the point of these tests.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '../../helpers/testDb';
import { testSessionUser } from '../../helpers/session';
import type { DatabaseAdapter } from '@/db/adapter';
import { v4 as uuidv4 } from 'uuid';
import { encrypt, generateKey, getEncryptionKey } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import type { SseManager } from '@/lib/sse';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET } from '@/app/api/journeys/[journeyId]/labs/route';

const REGISTERING = { id: '00000000-0000-4000-8000-0000000000c1', hcode: '99911' };
const UNRELATED = { id: '00000000-0000-4000-8000-0000000000c2', hcode: '99912' };
const REFERRED_TO = { id: '00000000-0000-4000-8000-0000000000c3', hcode: '99913' };
const VISITED = { id: '00000000-0000-4000-8000-0000000000c4', hcode: '99914' };
const UNKNOWN_JOURNEY = '00000000-0000-4000-8000-00000000dead';
const SECRET = 'Positive';

const sse = { broadcast(): void {} } as unknown as SseManager;

function call(journeyId: string) {
  return GET(new NextRequest(`http://localhost/api/journeys/${journeyId}/labs`), {
    params: Promise.resolve({ journeyId }),
  });
}

function signInAt(hcode: string, extra: Record<string, unknown> = {}) {
  mockSessionUser = { ...testSessionUser({ hospitalCode: hcode }), ...extra };
}

async function auditRows() {
  return db.query<{ action: string; resource_type: string; resource_id: string; metadata: unknown }>(
    'SELECT action, resource_type, resource_id, metadata FROM audit_logs',
  );
}

describe('GET /api/journeys/[journeyId]/labs', () => {
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
    const payload = {
      type: 'anc_data',
      hospitalCode: REGISTERING.hcode,
      patients: [
        {
          hn: 'HN-L1',
          name: 'นาง ทดสอบ ผลแลบ',
          cid: '1100500090006',
          birthday: '1994-02-01',
          pregNo: 1,
          lmp: '2026-01-01T00:00:00Z',
          labResults: [
            {
              source: 'anc_lab',
              sourceId: '1',
              resultDate: '2026-03-01',
              labItemsName: 'Anti HIV (ANC)',
              result: SECRET,
            },
          ],
        },
      ],
    } as WebhookAncPayload;
    await processAncWebhook(db, REGISTERING.id, payload, sse);
    journeyId = (await db.query<{ id: string }>('SELECT id FROM maternal_journeys'))[0].id;
    mockSessionUser = null;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await db.close();
  });

  it('rejects a request with no session and writes no audit row', async () => {
    const res = await call(journeyId);
    expect(res.status).toBe(401);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    expect(await auditRows()).toHaveLength(0);
  });

  it('denies a hospital with no link to the journey, with an actionable Thai message', async () => {
    signInAt(UNRELATED.hcode);
    const res = await call(journeyId);
    expect(res.status).toBe(403);
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain(SECRET);
    expect(text).toContain('ไม่มีสิทธิ์');
    expect(await auditRows()).toHaveLength(0);
  });

  it.each([
    ['ADMIN', { role: 'ADMIN' }],
    ['a read-only unit', { accessMode: 'readonly' }],
  ])('gives %s from an unrelated hospital no bypass', async (_label, extra) => {
    signInAt(UNRELATED.hcode, extra);
    expect((await call(journeyId)).status).toBe(403);
  });

  it('denies the exempt system hcodes too', async () => {
    signInAt('99999');
    expect((await call(journeyId)).status).toBe(403);
  });

  it('denies a session with no hospital code', async () => {
    signInAt(UNRELATED.hcode, { hospitalCode: undefined });
    expect((await call(journeyId)).status).toBe(403);
  });

  it('returns 404 for an unknown or malformed journey id', async () => {
    signInAt(REGISTERING.hcode);
    expect((await call(UNKNOWN_JOURNEY)).status).toBe(404);
    expect((await call('not-a-uuid')).status).toBe(404);
  });

  it('returns the labs to the registering hospital, uncached', async () => {
    signInAt(REGISTERING.hcode);
    const res = await call(journeyId);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = (await res.json()) as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ canonicalTest: 'HIV', interpretation: 'positive' });
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
      [uuidv4(), journeyId, hospitalId, now, now, now],
    );
  }

  async function addLab(hospitalId: string, result: string) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_anc_lab_results
         (id, journey_id, hospital_id, source, source_key, result_date, canonical_test, raw_result, concealed, content_hash, synced_at, created_at)
       VALUES (?, ?, ?, 'anc_lab', ?, '2026-04-01', 'HIV', ?, false, 'h', ?, ?)`,
      [uuidv4(), journeyId, hospitalId, uuidv4(), encrypt(result, getEncryptionKey()), now, now],
    );
  }

  async function addAdmission(hospitalId: string) {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, journey_id, synced_at, created_at, updated_at)
       VALUES (?, ?, 'HN-W', 'AN-W', 'x', 30, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [uuidv4(), hospitalId, now, journeyId, now, now, now],
    );
  }

  async function read(hcode: string) {
    signInAt(hcode);
    const res = await call(journeyId);
    if (res.status !== 200) return { status: res.status, tier: null, hospitals: [] as string[] };
    const body = (await res.json()) as { tier: string; results: Array<{ hcode: string }> };
    return { status: 200, tier: body.tier, hospitals: body.results.map((r) => r.hcode) };
  }

  describe('full access', () => {
    it('gives the registering hospital every hospital\'s results', async () => {
      await addLab(VISITED.id, 'Negative');
      const seen = await read(REGISTERING.hcode);
      expect(seen.tier).toBe('full');
      expect(seen.hospitals.sort()).toEqual([REGISTERING.hcode, VISITED.hcode].sort());
    });

    it.each(['INITIATED', 'ACCEPTED', 'IN_TRANSIT', 'ARRIVED'])(
      'gives the destination of a %s referral full access',
      async (status) => {
        await addReferral(REGISTERING.id, REFERRED_TO.id, status);
        expect(await read(REFERRED_TO.hcode)).toEqual({
          status: 200,
          tier: 'full',
          hospitals: [REGISTERING.hcode],
        });
      },
    );

    it('unlocks a destination as soon as the referral record exists', async () => {
      expect((await read(REFERRED_TO.hcode)).status).toBe(403);
      await addReferral(REGISTERING.id, REFERRED_TO.id, 'INITIATED');
      expect((await read(REFERRED_TO.hcode)).tier).toBe('full');
    });

    it.each(['REJECTED', 'EXPIRED'])('gives a %s referral destination nothing', async (status) => {
      await addReferral(REGISTERING.id, REFERRED_TO.id, status);
      expect((await read(REFERRED_TO.hcode)).status).toBe(403);
    });
  });

  describe('own results only', () => {
    it('shows a hospital with only a pushed visit none of the other hospital\'s rows', async () => {
      await addVisit(VISITED.id);
      expect(await read(VISITED.hcode)).toEqual({ status: 200, tier: 'own_results', hospitals: [] });
    });

    it('returns that hospital\'s own rows and no others', async () => {
      await addLab(VISITED.id, 'Negative');
      expect(await read(VISITED.hcode)).toEqual({
        status: 200,
        tier: 'own_results',
        hospitals: [VISITED.hcode],
      });
    });

    it('gives a walk-in labor admission its own rows only, once the admission syncs', async () => {
      expect((await read(VISITED.hcode)).status).toBe(403);
      await addAdmission(VISITED.id);
      expect(await read(VISITED.hcode)).toEqual({ status: 200, tier: 'own_results', hospitals: [] });
    });

    it('does not widen when a rejected referral sits beside its own visit', async () => {
      await addVisit(REFERRED_TO.id);
      await addReferral(REGISTERING.id, REFERRED_TO.id, 'REJECTED');
      expect(await read(REFERRED_TO.hcode)).toEqual({
        status: 200,
        tier: 'own_results',
        hospitals: [],
      });
    });
  });

  describe('links a hospital can create alone', () => {
    it('ignores a referral a hospital created to itself', async () => {
      await addReferral(UNRELATED.id, UNRELATED.id, 'ACCEPTED');
      expect((await read(UNRELATED.hcode)).status).toBe(403);
    });

    it('ignores a referral the hospital sent elsewhere', async () => {
      await addReferral(UNRELATED.id, REFERRED_TO.id, 'ACCEPTED');
      expect((await read(UNRELATED.hcode)).status).toBe(403);
    });

    it('keeps a sender with its own visit to its own rows', async () => {
      await addVisit(UNRELATED.id);
      await addReferral(UNRELATED.id, REFERRED_TO.id, 'ACCEPTED');
      expect(await read(UNRELATED.hcode)).toEqual({
        status: 200,
        tier: 'own_results',
        hospitals: [],
      });
    });

    it('ignores a self-set current hospital', async () => {
      await db.execute('UPDATE maternal_journeys SET current_hospital_id = ? WHERE id = ?', [
        UNRELATED.id,
        journeyId,
      ]);
      expect((await read(UNRELATED.hcode)).status).toBe(403);
    });
  });

  it.each([
    ['full', () => REGISTERING.hcode],
    ['own_results', () => VISITED.hcode],
  ])('writes one audit row for a successful read, with tier %s', async (tier, hcode) => {
    await addVisit(VISITED.id);
    signInAt(hcode());
    await call(journeyId);
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'VIEW_JOURNEY_LABS',
      resource_type: 'JOURNEY',
      resource_id: journeyId,
    });
    expect(rows[0].metadata).toEqual({ tier });
  });

  it('keeps results out of the log when a read is denied or fails', async () => {
    const spies = [vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error'), vi.spyOn(logger, 'info')];
    signInAt(UNRELATED.hcode);
    await call(journeyId);
    signInAt(REGISTERING.hcode);
    vi.spyOn(db, 'query').mockRejectedValueOnce(new Error(`boom ${SECRET}`));
    const res = await call(journeyId);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain(SECRET);
    const logged = JSON.stringify(
      spies.flatMap((s) => s.mock.calls),
      (_k, v: unknown) => (v instanceof Error ? v.message : v),
    );
    expect(logged).not.toContain(SECRET);
    expect(logged).not.toContain('ทดสอบ');
    expect(logged).not.toContain('1100500090006');
  });
});
