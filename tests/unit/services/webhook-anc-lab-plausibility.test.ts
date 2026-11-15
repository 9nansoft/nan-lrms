// A browser tab loaded before a deploy keeps pushing the old payload, so the
// server is the last line of defence against a hematocrit stored as hemoglobin.
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import type { SseManager } from '@/lib/sse';

const HOSPITAL_ID = 'hosp-anc-lab';
const sse = { broadcast(): void {} } as unknown as SseManager;

function payload(hbGDl: number, hctPct: number): WebhookAncPayload {
  return {
    type: 'anc_data',
    hospitalCode: '99903',
    patients: [
      {
        hn: 'HN-L1',
        name: 'นาง ทดสอบ ผลแล็บ',
        cid: '1100500090006', // checksum-valid synthetic CID
        birthday: '1994-02-01',
        pregNo: 1,
        lmp: '2026-01-01T00:00:00Z',
        edc: '2026-10-08T00:00:00Z',
        visits: [{ date: '2026-03-01', visitNumber: 1, hbGDl, hctPct }],
      },
    ],
  } as WebhookAncPayload;
}

describe('processAncWebhook — lab plausibility', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = await createTestDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, '99903', 'รพ.ทดสอบ Lab', 'F1', true, 'ONLINE', ?, ?)`,
      [HOSPITAL_ID, now, now],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  async function storedVisit(): Promise<{ hb_g_dl: string | null; hct_pct: string | null }> {
    const rows = await db.query<{ hb_g_dl: string | null; hct_pct: string | null }>(
      'SELECT hb_g_dl, hct_pct FROM cached_anc_visits',
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it('drops a hemoglobin no patient can have, keeping the visit and its hematocrit', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload(38.9, 36), sse);
    const visit = await storedVisit();
    expect(visit.hb_g_dl).toBeNull();
    expect(Number(visit.hct_pct)).toBe(36);
  });

  it('keeps a genuine hemoglobin, including a severely low one', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload(5.2, 18), sse);
    expect(Number((await storedVisit()).hb_g_dl)).toBe(5.2);
  });
});
