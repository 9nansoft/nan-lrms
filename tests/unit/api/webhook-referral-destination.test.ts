import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey } from '@/services/webhook';
import { processBrowserReferouts } from '@/services/sync/referrals';

let db: DatabaseAdapter;
vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));
import { POST } from '@/app/api/webhooks/patient-data/route';

describe('registry-only referral destinations', () => {
  let key: string;
  beforeEach(async () => {
    process.env.ENCRYPTION_KEY ??= generateKey();
    db = await createTestDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES ('origin', '99902', 'Test origin', 'M2', true, 'ONLINE', ?, ?)`, [now, now],
    );
    await db.execute(
      `INSERT INTO moph_hospitals (hcode, name, hospital_type_id, province_code, district_code)
       VALUES ('13777', 'Registry referral destination', 12, '40', '4001') ON CONFLICT (hcode) DO NOTHING`,
    );
    key = (await createApiKey(db, 'origin', 'Test')).rawKey;
  });

  function request(toHospitalCode = '13777', referralId = 'REF-REGISTRY') {
    return new NextRequest('http://test/api/webhooks/patient-data', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ type: 'referral', hospitalCode: '99902', referralId,
        hn: 'SYNTHETIC-1', cid: '1100500090006', name: 'Synthetic patient',
        toHospitalCode, reason: 'Test referral' }),
    });
  }

  it('accepts registry destination, retains idempotency, and does not activate monitoring', async () => {
    expect((await POST(request())).status).toBe(200);
    expect((await POST(request())).status).toBe(200);
    const hospitals = await db.query<{ id: string; is_active: boolean; level: string; connection_status: string }>(
      "SELECT id, is_active, level, connection_status FROM hospitals WHERE hcode = '13777'",
    );
    expect(hospitals).toHaveLength(1);
    expect(hospitals[0]).toMatchObject({ is_active: false, level: 'UNKNOWN', connection_status: 'UNKNOWN' });
    expect(await db.query('SELECT id FROM hospitals WHERE is_active = true')).toHaveLength(1);
    expect(await db.query('SELECT id FROM cached_referrals WHERE to_hospital_id = ?', [hospitals[0].id])).toHaveLength(1);
    expect(await db.query('SELECT id FROM webhook_api_keys WHERE hospital_id = ?', [hospitals[0].id])).toHaveLength(0);
  });

  it('returns an actionable 400 for a code absent from both registries, without patient writes', async () => {
    const response = await POST(request('00000'));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: 'REFERRAL_DESTINATION_NOT_FOUND' });
    expect(await db.query('SELECT id FROM maternal_journeys')).toHaveLength(0);
    expect(await db.query('SELECT id FROM cached_referrals')).toHaveLength(0);
  });

  it('uses the same destination resolution for browser referrals', async () => {
    // The webhook supplies the existing maternal journey required by browser sync.
    expect((await POST(request('99902', 'SEED-JOURNEY'))).status).toBe(200);
    const result = await processBrowserReferouts(db, 'origin', [{
      refer_number: 'BROWSER-REGISTRY', refer_date: new Date().toISOString().slice(0, 10),
      refer_hospcode: '13777', hn: 'SYNTHETIC-1', cid: '1100500090006',
    }]);
    expect(result).toMatchObject({ created: 1, skippedUnknownHospital: 0, failed: 0 });
  });
});
