// The purge guard on the webhook path.
//
// The admin deletes a hospital's data on request (PDPA) and every sync path
// is suspended until the hospital is re-onboarded. The webhook is the path
// of the hospitals that are NOT on HOSxP — their own system posts the data.
// Without a guard, a sender that never stops retrying puts the erased data
// straight back into the cache.
//
// The rule under test: a purged hospital's webhook is REFUSED, and the sender
// is told the push was not stored (a silent 200 would have it report a
// successful sync of data the province erased).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey } from '@/services/webhook';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/webhooks/patient-data/route';

const HCODE = '10670';

function jsonRequest(body: unknown, rawKey: string): Request {
  return new Request('http://test/api/webhooks/patient-data', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${rawKey}` },
    body: JSON.stringify(body),
  });
}

const ancPayload = {
  type: 'anc_data',
  hospitalCode: HCODE,
  patients: [
    {
      hn: 'WH-PURGE-1',
      name: 'นาง ทดสอบ ลบข้อมูล',
      cid: '1007000100131',
      birthday: '1994-06-20',
      pregNo: 1,
      riskLevel: 'LOW',
    },
  ],
};

describe('POST /api/webhooks/patient-data — a purged hospital', () => {
  let hospitalId: string;
  let rawKey: string;

  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
      HCODE,
    ]);
    hospitalId = rows[0].id;
    const key = await createApiKey(db, hospitalId, 'test key');
    rawKey = key.rawKey;

    // The purge flag lives on the BMS config row.
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, created_at, updated_at)
       VALUES (?, ?, 'https://tunnel.test', ?, ?)
       ON CONFLICT (hospital_id) DO NOTHING`,
      [`hbc-purge-${HCODE}`, hospitalId, now, now],
    );
  });

  it('refuses the push and stores nothing', async () => {
    await db.execute(
      'UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?',
      ['2026-11-01T00:00:00.000Z', hospitalId],
    );

    const res = await POST(jsonRequest(ancPayload, rawKey) as never);

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('HOSPITAL_PURGED');
    // The sender must be told what to do — not left guessing.
    expect(body.suggestedAction).toBeTruthy();

    // Nothing of the erased hospital came back.
    const stored = await db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM cached_anc_visits WHERE hospital_id = ?',
      [hospitalId],
    );
    expect(Number(stored[0].n)).toBe(0);
  });

  it('accepts the push again once the hospital is re-onboarded', async () => {
    await db.execute(
      'UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?',
      ['2026-11-01T00:00:00.000Z', hospitalId],
    );
    // The admin re-opens the sync (the same thing /clear-purge does).
    await db.execute(
      'UPDATE hospital_bms_config SET data_purged_at = NULL WHERE hospital_id = ?',
      [hospitalId],
    );

    const res = await POST(jsonRequest(ancPayload, rawKey) as never);

    expect(res.status).toBe(200);
  });
});
