// The lab store must be idempotent per hospital (HOSxP ids repeat across
// sites) and must never block a journey delete with a dangling FK.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import type { SseManager } from '@/lib/sse';

const sse = { broadcast(): void {} } as unknown as SseManager;
const HOSPITAL_A = '00000000-0000-4000-8000-00000000000a';
const HOSPITAL_B = '00000000-0000-4000-8000-00000000000b';
const CID = '1100500090006';

function ancPayload(action?: 'delete'): WebhookAncPayload {
  return {
    type: 'anc_data',
    hospitalCode: '99903',
    patients: [
      {
        hn: 'HN-T1',
        name: 'นาง ทดสอบ ตาราง',
        cid: CID,
        birthday: '1994-02-01',
        pregNo: 1,
        lmp: '2026-01-01T00:00:00Z',
        edc: '2026-10-08T00:00:00Z',
        ...(action ? { action } : {}),
      },
    ],
  } as WebhookAncPayload;
}

describe('cached_anc_lab_results table', () => {
  let db: DatabaseAdapter;
  let journeyId: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = await createTestDb();
    const now = new Date().toISOString();
    for (const [id, hcode] of [
      [HOSPITAL_A, '99903'],
      [HOSPITAL_B, '99904'],
    ]) {
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
         VALUES (?, ?, 'รพ.ทดสอบ', 'F1', true, 'ONLINE', ?, ?)`,
        [id, hcode, now, now],
      );
    }
    await processAncWebhook(db, HOSPITAL_A, ancPayload(), sse);
    const rows = await db.query<{ id: string }>('SELECT id FROM maternal_journeys');
    journeyId = rows[0].id;
  });

  async function insertLab(id: string, hospitalId: string, sourceKey: string): Promise<void> {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_anc_lab_results
         (id, journey_id, hospital_id, source, source_key, concealed, content_hash, synced_at, created_at)
       VALUES (?, ?, ?, 'anc_lab', ?, false, 'h', ?, ?)`,
      [id, journeyId, hospitalId, sourceKey, now, now],
    );
  }

  it('exposes every column the ingest and the UI rely on', async () => {
    const cols = await db.getColumnInfo('cached_anc_lab_results');
    const names = cols.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'journey_id',
        'hospital_id',
        'source',
        'source_key',
        'result_date',
        'ga_weeks',
        'canonical_test',
        'classification_note',
        'anc_lab_name',
        'lab_items_name',
        'lab_items_code',
        'raw_result',
        'numeric_value',
        'normalized_value',
        'interpretation',
        'unit',
        'normal_reference',
        'abnormal_flag',
        'anc_result_normal_raw',
        'concealed',
        'content_hash',
        'synced_at',
        'created_at',
      ]),
    );
  });

  it('rejects a second row with the same source key at one hospital', async () => {
    await insertLab('00000000-0000-4000-8000-000000000001', HOSPITAL_A, 'anc_lab:1');
    await expect(
      insertLab('00000000-0000-4000-8000-000000000002', HOSPITAL_A, 'anc_lab:1'),
    ).rejects.toThrow();
  });

  it('allows the same HOSxP id at a different hospital', async () => {
    await insertLab('00000000-0000-4000-8000-000000000001', HOSPITAL_A, 'anc_lab:1');
    await insertLab('00000000-0000-4000-8000-000000000002', HOSPITAL_B, 'anc_lab:1');
    const rows = await db.query('SELECT id FROM cached_anc_lab_results');
    expect(rows).toHaveLength(2);
  });

  it('does not block deleting a journey that has lab rows', async () => {
    await insertLab('00000000-0000-4000-8000-000000000001', HOSPITAL_A, 'anc_lab:1');
    await processAncWebhook(db, HOSPITAL_A, ancPayload('delete'), sse);
    expect(await db.query('SELECT id FROM maternal_journeys')).toHaveLength(0);
    expect(await db.query('SELECT id FROM cached_anc_lab_results')).toHaveLength(0);
  });
});
