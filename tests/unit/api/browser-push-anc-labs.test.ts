// The route, not just the service: lab rows and the truncation flag must
// survive payload validation and show up in the admin Sync Log.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';
import { logger } from '@/lib/logger';
import { getLatestSyncRun } from '@/services/sync/progress-store';

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

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/sync/browser-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const patient = {
  hn: 'BP-LAB-1',
  name: 'นาง ทดสอบ เบราว์เซอร์',
  cid: '1007000100034',
  birthday: '1994-06-20',
  pregNo: 1,
  labResults: [
    { source: 'anc_lab', sourceId: '11', labItemsName: 'Hct', result: '36' },
    { source: 'bogus', sourceId: '12' },
  ],
};

describe('POST /api/sync/browser-push — ANC labs', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: HCODE });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores lab rows and reports their counts in the response and Sync Log', async () => {
    const res = await POST(jsonRequest({ anc: { patients: [patient] } }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.anc.labs).toMatchObject({ upserted: 1, skipped: 1 });
    expect(await db.query('SELECT id FROM cached_anc_lab_results')).toHaveLength(1);

    const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
      HCODE,
    ]);
    const run = await getLatestSyncRun(rows[0].id);
    const step = run!.steps.find((s) => s.name === 'persist_anc' && s.status === 'success');
    expect(step!.counts).toMatchObject({ labsUpserted: 1, labsSkipped: 1 });
  });

  it('passes the truncation flag through to the ingest log', async () => {
    const warn = vi.spyOn(logger, 'warn');
    const res = await POST(
      jsonRequest({ anc: { patients: [patient], labsTruncated: true } }) as never,
    );
    expect(res.status).toBe(200);
    expect(warn).toHaveBeenCalledWith('anc_lab_pull_truncated', expect.anything());
  });

  it('treats a non-boolean truncation flag as absent', async () => {
    const warn = vi.spyOn(logger, 'warn');
    await POST(jsonRequest({ anc: { patients: [patient], labsTruncated: 'yes' } }) as never);
    expect(warn).not.toHaveBeenCalledWith('anc_lab_pull_truncated', expect.anything());
  });
});
