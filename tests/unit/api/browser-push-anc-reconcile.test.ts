// ANC absent-pregnancy reconciliation through /api/sync/browser-push.
//
// The browser gateway sends `anc.activeCids` — every CID HOSxP's active-ANC
// query returned this cycle, BEFORE the name probe filters patients, and only
// when the result was not truncated. The route hashes them and closes this
// hospital's PREGNANCY journeys HOSxP no longer lists (รพ.หนองสองห้อง
// 2026-10-28: ten discharged women stuck on the board). See
// tests/unit/services/anc-absent-reconcile.test.ts for the closing rules.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHash } from 'crypto';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';
import { getLatestSyncRun } from '@/services/sync/progress-store';
import { createJourney } from '@/services/journey';
import { ANC_ABSENT_CLOSED_REASON } from '@/config/anc-freshness';
import { AncRiskLevel, CareStage } from '@/types/domain';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/sync/browser-push/route';

const HCODE = '10670';
const LISTED_CID = '1007000100131';
const GONE_CID = '1007000100140';
const DAY_MS = 86_400_000;

const sha = (cid: string) => createHash('sha256').update(cid).digest('hex');

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/sync/browser-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function hospitalId(): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE]);
  return rows[0].id;
}

/** A PREGNANCY journey for `cid` that no sync has refreshed for 30 days. */
async function staleJourney(cid: string, hn: string): Promise<string> {
  const j = await createJourney(db, {
    hospitalId: await hospitalId(),
    hn,
    personAncId: null,
    name: 'enc',
    cid: 'enc',
    cidHash: sha(cid),
    age: 30,
    gravida: 1,
    para: 0,
    lmp: null,
    edc: null,
    ancRiskLevel: AncRiskLevel.LOW,
  });
  const old = new Date(Date.now() - 30 * DAY_MS).toISOString();
  await db.execute('UPDATE maternal_journeys SET synced_at = ?, updated_at = ? WHERE id = ?', [
    old,
    old,
    j.id,
  ]);
  return j.id;
}

async function stage(id: string): Promise<{ care_stage: string; closed_reason: string | null }> {
  const rows = await db.query<{ care_stage: string; closed_reason: string | null }>(
    'SELECT care_stage, closed_reason FROM maternal_journeys WHERE id = ?',
    [id],
  );
  return rows[0];
}

const patient = (cid: string, hn: string) => ({
  hn,
  name: 'นาง ทดสอบ กระทบยอด',
  cid,
  birthday: '1994-06-20',
  pregNo: 1,
  lmp: '2026-05-01',
  edc: '2027-02-05',
});

describe('POST /api/sync/browser-push — ANC absent-pregnancy reconciliation', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: HCODE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('closes a pregnancy missing from activeCids and records it in the sync log', async () => {
    const listed = await staleJourney(LISTED_CID, 'HN-LISTED');
    const gone = await staleJourney(GONE_CID, 'HN-GONE');

    const res = await POST(
      jsonRequest({
        anc: { patients: [patient(LISTED_CID, 'HN-LISTED')], activeCids: [LISTED_CID] },
      }) as never,
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ancReconcile).toEqual({ closed: 1 });

    expect(await stage(listed)).toEqual({ care_stage: CareStage.PREGNANCY, closed_reason: null });
    expect(await stage(gone)).toEqual({
      care_stage: CareStage.DELIVERED,
      closed_reason: ANC_ABSENT_CLOSED_REASON,
    });

    const run = await getLatestSyncRun(await hospitalId());
    const step = run?.steps.find((s) => s.name === 'reconcile_anc');
    expect(step?.status).toBe('success');
    expect(step?.counts).toMatchObject({ closed: 1, listed: 1 });
  });

  it('reconciles even when every listed woman was filtered out of patients', async () => {
    // The name probe can drop all patients while HOSxP still returned rows;
    // activeCids is built before the probe, so it still protects them.
    const listed = await staleJourney(LISTED_CID, 'HN-LISTED');
    const gone = await staleJourney(GONE_CID, 'HN-GONE');

    const res = await POST(
      jsonRequest({ anc: { patients: [], activeCids: [LISTED_CID] } }) as never,
    );
    expect(res.status).toBe(200);

    expect((await stage(listed)).care_stage).toBe(CareStage.PREGNANCY);
    expect((await stage(gone)).care_stage).toBe(CareStage.DELIVERED);
  });

  it('closes nothing when the client sent no active set (truncated pull / older bundle)', async () => {
    const gone = await staleJourney(GONE_CID, 'HN-GONE');

    const res = await POST(
      jsonRequest({ anc: { patients: [patient(LISTED_CID, 'HN-LISTED')] } }) as never,
    );
    expect(res.status).toBe(200);
    expect((await res.json()).ancReconcile).toBeUndefined();
    expect((await stage(gone)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it('rejects an active set that omits a woman the same push is upserting', async () => {
    // The gateway builds activeCids from the same rows as patients, so a
    // patient missing from it means the list is not the complete active set.
    const gone = await staleJourney(GONE_CID, 'HN-GONE');

    const res = await POST(
      jsonRequest({
        anc: { patients: [patient(LISTED_CID, 'HN-LISTED')], activeCids: [] },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect((await stage(gone)).care_stage).toBe(CareStage.PREGNANCY);
    const run = await getLatestSyncRun(await hospitalId());
    expect(run?.steps.find((s) => s.name === 'reconcile_anc')?.status).toBe('error');
  });

  it('rejects a malformed active set rather than closing against it', async () => {
    const gone = await staleJourney(GONE_CID, 'HN-GONE');

    const res = await POST(
      jsonRequest({ anc: { patients: [], activeCids: ['not-a-cid', 42] } }) as never,
    );
    expect(res.status).toBe(200);
    expect((await stage(gone)).care_stage).toBe(CareStage.PREGNANCY);

    const run = await getLatestSyncRun(await hospitalId());
    expect(run?.steps.find((s) => s.name === 'reconcile_anc')?.status).toBe('error');
  });

  it('reopens a reconciliation-closed pregnancy when HOSxP lists her again', async () => {
    const gone = await staleJourney(GONE_CID, 'HN-GONE');
    await POST(jsonRequest({ anc: { patients: [], activeCids: [] } }) as never);
    expect((await stage(gone)).care_stage).toBe(CareStage.DELIVERED);

    const res = await POST(
      jsonRequest({
        anc: { patients: [patient(GONE_CID, 'HN-GONE')], activeCids: [GONE_CID] },
      }) as never,
    );
    expect(res.status).toBe(200);
    expect(await stage(gone)).toEqual({ care_stage: CareStage.PREGNANCY, closed_reason: null });
  });
});
