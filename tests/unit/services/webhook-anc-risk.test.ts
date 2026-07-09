// ANC webhook risk screening — the browser/webhook path must persist a
// cached_anc_risks row (level + Thai item labels + recommendation) so the
// journey detail "Risk assessment" panel populates, deduped so unchanged
// classifications don't grow the table on every push.
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { SqliteAdapter } from '@/db/sqlite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables';
import { generateKey } from '@/lib/encryption';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import { ANC_RISK_CONFIGS } from '@/config/anc-risk-rules';
import { AncRiskLevel } from '@/types/domain';
import type { SseManager } from '@/lib/sse';

const HOSPITAL_ID = 'hosp-anc-risk';

class MockSseManager {
  broadcast(): void {}
}
function asSse(mock: MockSseManager): SseManager {
  return mock as unknown as SseManager;
}

function payload(riskItemIds: number[] | undefined, riskLevel: string): WebhookAncPayload {
  return {
    type: 'anc_data',
    hospitalCode: '99902',
    patients: [
      {
        hn: 'HN-R1',
        name: 'นาง ทดสอบ ความเสี่ยง',
        cid: '1100500090006', // checksum-valid synthetic CID
        birthday: '1994-02-01',
        pregNo: 1,
        lmp: '2026-01-01',
        edc: '2026-10-08',
        riskLevel,
        riskItemIds,
      },
    ],
  } as WebhookAncPayload;
}

describe('processAncWebhook — risk screening persistence', () => {
  let db: SqliteAdapter;
  let sse: SseManager;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await SchemaSync.sync(db, ALL_TABLES, 'sqlite');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, '99902', 'รพ.ทดสอบ Risk', 'F1', 1, 'ONLINE', ?, ?)`,
      [HOSPITAL_ID, now, now],
    );
    sse = asSse(new MockSseManager());
  });

  afterEach(async () => {
    await db.close();
  });

  async function riskRows(): Promise<
    Array<{ risk_level: string; triggered_rules: string; recommended_facility: string | null }>
  > {
    return db.query(
      `SELECT risk_level, triggered_rules, recommended_facility
         FROM cached_anc_risks ORDER BY screened_at, created_at`,
    );
  }

  it('records a screening row with Thai labels and the provincial recommendation', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload([3, 16], 'HR3'), sse);

    const rows = await riskRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].risk_level).toBe('HR3');
    const rules = JSON.parse(rows[0].triggered_rules) as string[];
    expect(rules.some((r) => /หัวใจ/.test(r))).toBe(true);
    expect(rows[0].recommended_facility).toBe(ANC_RISK_CONFIGS[AncRiskLevel.HR3].facilityTh);
  });

  it('dedupes: an unchanged classification does not insert another row', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload([3, 16], 'HR3'), sse);
    await processAncWebhook(db, HOSPITAL_ID, payload([3, 16], 'HR3'), sse);

    expect(await riskRows()).toHaveLength(1);
  });

  it('a changed classification appends a new screening row', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload([3, 16], 'HR3'), sse);
    await processAncWebhook(db, HOSPITAL_ID, payload([3], 'HR1'), sse);

    const rows = await riskRows();
    expect(rows).toHaveLength(2);
    expect(rows[1].risk_level).toBe('HR1');
  });

  it('LOW with no items still records the baseline screening once', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload([], 'LOW'), sse);
    await processAncWebhook(db, HOSPITAL_ID, payload([], 'LOW'), sse);

    const rows = await riskRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].risk_level).toBe('LOW');
  });

  it('legacy clients without riskItemIds do not write screening rows', async () => {
    await processAncWebhook(db, HOSPITAL_ID, payload(undefined, 'HR2'), sse);

    expect(await riskRows()).toHaveLength(0);
  });
});
