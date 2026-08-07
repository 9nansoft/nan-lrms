// tests/unit/api/profile-notification-preference.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { GET, PUT, DELETE } from '@/app/api/profile/notification-preference/route';

function req(method: string, body?: unknown): Request {
  return new Request('http://test/api/profile/notification-preference', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** PUT with a JSON body — the shape every multi-hospital save uses. */
function jsonRequest(body: unknown): Request {
  return req('PUT', body);
}

describe('GET/PUT /api/profile/notification-preference', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: '10670' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('GET 401 when anonymous', async () => {
    mockSessionUser = null;
    const res = await GET(req('GET') as never);
    expect(res.status).toBeGreaterThanOrEqual(401);
  });

  it('GET 200 with no watched hospital when no row (Default OFF)', async () => {
    // The single mophLineEnabled scalar became a list of watched hospitals
    // (spec 2026-08-07). Default OFF now reads as "watching nothing".
    const res = await GET(req('GET') as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userCid: string;
      ownHospitalCode: string;
      preferences: unknown[];
    };
    expect(body.userCid).toBe('1100500090006'); // testSessionUser default userCid
    expect(body.ownHospitalCode).toBe('10670');
    expect(body.preferences).toEqual([]);
  });

  it('PUT upserts from session identity (body cannot set CID)', async () => {
    const res = await PUT(
      req('PUT', {
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
        userCid: '9999999999999', // hostile: must be ignored in favour of the session
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      userCid: '1100500090006',
      hospitalCode: '10670',
      mophLineEnabled: true,
    });
    const rows = await db.query<{ user_cid: string }>(
      'SELECT user_cid FROM notification_preferences',
    );
    expect(rows[0].user_cid).toBe('1100500090006');
  });

  it('PUT 400 on non-boolean body and 401 when anonymous', async () => {
    // hospitalCode is supplied so this genuinely exercises the boolean guard
    // rather than passing on the missing-hospital branch.
    const bad = await PUT(req('PUT', { hospitalCode: '10670', mophLineEnabled: 'yes' }) as never);
    expect(bad.status).toBe(400);
    mockSessionUser = null;
    const anon = await PUT(req('PUT', { hospitalCode: '10670', mophLineEnabled: true }) as never);
    expect(anon.status).toBeGreaterThanOrEqual(401);
  });

  it('PUT rejects a session with empty/non-13-digit userCid (no false opt-in)', async () => {
    // P1-B (codex): BMS can map a missing user_cid to '' — a preference row
    // keyed '' is silently dropped by isValidCid at enqueue time, so the user
    // would falsely believe they opted in. The API must reject it.
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '' });
    const res = await PUT(req('PUT', { mophLineEnabled: true }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('CID');
    const rows = await db.query<{ user_cid: string }>(
      'SELECT user_cid FROM notification_preferences',
    );
    expect(rows).toHaveLength(0);
  });
});

describe('multi-hospital preference API', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
  });
  afterEach(() => vi.restoreAllMocks());

  it('derives detailLevel=full for the session hospital and aggregate for others', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });

    const own = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(((await own.json()) as { detailLevel: string }).detailLevel).toBe('full');

    const other = await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(((await other.json()) as { detailLevel: string }).detailLevel).toBe('aggregate');
  });

  it('ignores a detailLevel supplied in the body (no privilege escalation)', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
        detailLevel: 'full',
      }) as never,
    );
    expect(((await res.json()) as { detailLevel: string }).detailLevel).toBe('aggregate');
  });

  it('GET returns only implemented events plus every watched hospital', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    const body = (await (await GET(new Request('http://t/api') as never)).json()) as {
      events: { key: string }[];
      preferences: { hospitalCode: string }[];
    };
    expect(body.events.map((e) => e.key).sort()).toEqual(['anc_hr3', 'maternal_triage']);
    expect(body.preferences.map((p) => p.hospitalCode)).toContain('11002');
  });

  it('rejects an unknown event key', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['not_an_event'],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a digestHour outside 0-23', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    const res = await PUT(
      jsonRequest({
        hospitalCode: '10670',
        mophLineEnabled: true,
        digestHour: 25,
        events: ['anc_hr3'],
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it('DELETE removes a watched hospital', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '3320500282121' });
    await PUT(
      jsonRequest({
        hospitalCode: '11002',
        mophLineEnabled: true,
        digestHour: 8,
        events: ['anc_hr3'],
      }) as never,
    );
    const res = await DELETE(
      new Request('http://t/api?hospitalCode=11002', { method: 'DELETE' }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await (await GET(new Request('http://t/api') as never)).json()) as {
      preferences: { hospitalCode: string }[];
    };
    expect(body.preferences.map((p) => p.hospitalCode)).not.toContain('11002');
  });
});
