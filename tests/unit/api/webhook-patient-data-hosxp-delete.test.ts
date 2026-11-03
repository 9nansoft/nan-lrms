// End-to-end through the real route: HOSxP's admit form sends a labour
// `delete` on every save (HOSxP defect A-F10). The route must (1) log every
// delete PHI-free and (2) not empty the board for a still-ACTIVE admission
// when the caller is HOSxP itself (key pushed into its webhook_setting).
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey } from '@/services/webhook';
import { logger } from '@/lib/logger';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/webhooks/patient-data/route';

const HCODE = '10670';
const CID = '1100500090006';

function jsonRequest(body: unknown, rawKey: string): Request {
  return new Request('http://test/api/webhooks/patient-data', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawKey}` },
    body: JSON.stringify(body),
  });
}

const labour = (action?: 'delete') => ({
  hospitalCode: HCODE,
  patients: [
    {
      an: 'AN-AF10',
      hn: 'HN-AF10',
      cid: CID,
      name: 'นางทดสอบ บันทึกซ้ำ',
      age: 30,
      admit_date: '2026-10-21T18:15:00Z',
      labor_status: 'ACTIVE',
      ...(action ? { action } : {}),
    },
  ],
});

describe('POST /api/webhooks/patient-data — labour deletes from HOSxP', () => {
  let hospitalId: string;

  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    hospitalId = (
      await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE])
    )[0].id;
  });
  afterEach(() => vi.restoreAllMocks());

  async function key(pushedToHosxp: boolean): Promise<string> {
    const k = await createApiKey(db, hospitalId, 'test key');
    if (pushedToHosxp) {
      await db.execute('UPDATE webhook_api_keys SET pushed_to_hosxp_at = ? WHERE id = ?', [
        new Date().toISOString(),
        k.id,
      ]);
    }
    return k.rawKey;
  }

  const activeCount = async () =>
    (
      await db.query<{ id: string }>(
        "SELECT id FROM cached_patients WHERE hospital_id = ? AND an = 'AN-AF10' AND labor_status = 'ACTIVE'",
        [hospitalId],
      )
    ).length;

  it('HOSxP key: the delete is logged, ignored, and the woman stays on the board', async () => {
    const rawKey = await key(true);
    expect((await POST(jsonRequest(labour(), rawKey) as never)).status).toBe(200);
    const warn = vi.spyOn(logger, 'warn');

    const res = await POST(jsonRequest(labour('delete'), rawKey) as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(0);
    expect(json.deleteIgnored).toBe(1);
    expect(await activeCount()).toBe(1);

    expect(warn).toHaveBeenCalledWith(
      'webhook_delete_received',
      expect.objectContaining({
        sender: 'hosxp',
        payloadType: 'labor',
        count: 1,
        ans: ['AN-AF10'],
      }),
    );
    expect(warn).toHaveBeenCalledWith(
      'webhook_labor_delete_ignored',
      expect.objectContaining({ hcode: HCODE, ans: ['AN-AF10'] }),
    );
    // PHI never reaches the delete log lines.
    for (const [, ctx] of warn.mock.calls) expect(JSON.stringify(ctx)).not.toContain(CID);
  });

  it('admin-issued (non-HOSxP) key: the delete still applies, and is logged', async () => {
    const rawKey = await key(false);
    await POST(jsonRequest(labour(), rawKey) as never);
    const warn = vi.spyOn(logger, 'warn');

    const json = await (await POST(jsonRequest(labour('delete'), rawKey) as never)).json();
    expect(json.deleted).toBe(1);
    expect(await activeCount()).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      'webhook_delete_received',
      expect.objectContaining({ sender: 'external', count: 1 }),
    );
    expect(warn).toHaveBeenCalledWith(
      'webhook_labor_delete_applied',
      expect.objectContaining({ ans: ['AN-AF10'] }),
    );
  });

  it('no delete in the payload → no delete log line', async () => {
    const rawKey = await key(true);
    const warn = vi.spyOn(logger, 'warn');
    await POST(jsonRequest(labour(), rawKey) as never);
    expect(warn.mock.calls.map(([e]) => e)).not.toContain('webhook_delete_received');
  });
});
