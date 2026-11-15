// A real Postgres error, from a real constraint, inside the real transaction:
// one patient's bad lab batch must cost only that batch. Uses a private
// database because adding a constraint is DDL the shared harness cannot undo.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { createPgliteDb } from '../../helpers/createPgliteDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import type { AncLabPayloadRow } from '@/services/anc-lab-classifier';
import type { SseManager } from '@/lib/sse';

const HOSPITAL_ID = '00000000-0000-4000-8000-0000000000c1';
const sse = { broadcast(): void {} } as unknown as SseManager;
const VISIT_DAY = '2026-03-01';

const lab = (sourceId: string): AncLabPayloadRow => ({
  source: 'anc_lab',
  sourceId,
  resultDate: VISIT_DAY,
  labItemsName: 'Hct',
  result: '36',
});

const person = (hn: string, cid: string, labResults: AncLabPayloadRow[]) => ({
  hn,
  name: 'นาง ทดสอบ ล้มเหลว',
  cid,
  birthday: '1994-02-01',
  pregNo: 1,
  lmp: '2026-01-01T00:00:00Z',
  visits: [{ date: VISIT_DAY, visitNumber: 1 }],
  labResults,
});

describe('processAncWebhook — a lab write that fails in the database', () => {
  let db: DatabaseAdapter;

  beforeAll(async () => {
    process.env.ENCRYPTION_KEY = generateKey();
    db = await createPgliteDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, '99906', 'รพ.ทดสอบล้ม', 'F1', true, 'ONLINE', ?, ?)`,
      [HOSPITAL_ID, now, now],
    );
    await db.execute(
      `ALTER TABLE cached_anc_lab_results
         ADD CONSTRAINT test_reject CHECK (source_key <> 'anc_lab:boom')`,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const push = (patients: ReturnType<typeof person>[]) =>
    processAncWebhook(
      db,
      HOSPITAL_ID,
      { type: 'anc_data', hospitalCode: '99906', patients } as WebhookAncPayload,
      sse,
    );

  it('costs only that batch, leaves the connection usable, and is reported', async () => {
    const error = vi.spyOn(logger, 'error');

    const result = await push([
      person('HN-F1', '1100500090006', [lab('shared'), lab('boom')]),
      // Same source key as the rolled-back row: it must not look already stored.
      person('HN-F2', '1007000100034', [lab('shared')]),
    ]);

    expect(result.labs).toMatchObject({ skipped: 2, upserted: 1 });
    const stored = await db.query<{ source_key: string; hn: string }>(
      `SELECT r.source_key, j.hn FROM cached_anc_lab_results r
         JOIN maternal_journeys j ON j.id = r.journey_id`,
    );
    expect(stored).toEqual([{ source_key: 'anc_lab:shared', hn: 'HN-F2' }]);

    // The failed patient's journey and visit survive, and later writes work.
    const visits = await db.query<{ hn: string }>(
      `SELECT j.hn FROM cached_anc_visits v
         JOIN maternal_journeys j ON j.id = v.journey_id ORDER BY j.hn`,
    );
    expect(visits.map((v) => v.hn)).toEqual(['HN-F1', 'HN-F2']);

    const logged = JSON.stringify(error.mock.calls);
    expect(logged).toContain('anc_lab_upsert_failed');
    expect(logged).toContain('23514'); // check_violation, the only error detail kept
    expect(logged).not.toContain('boom');
    expect(logged).not.toContain('test_reject');
  });
});
