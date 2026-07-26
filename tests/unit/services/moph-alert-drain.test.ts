// TDD (Red→Green) for the bounded MOPH alert drain — the ONLY LINE I/O site.
// Pins codex #1 (hybrid drain): pop pending rows, send each within a budget,
// never throw to caller. 502→stay pending+attempts++; 400→terminal failed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PgliteAdapter, createPglite } from '@/db/pglite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables/index';
import { randomUUID } from 'node:crypto';
import { drainMophAlerts } from '@/services/moph-alert-drain';

// Mock the sender: default success, per-test override via mockSend.
const mockSend = vi.fn();
vi.mock('@/services/moph-prompt', () => ({
  sendMophPrompt: (...args: unknown[]) => mockSend(...args),
  MophPromptError: class extends Error {
    code: string;
    statusCode: number;
    constructor(c: string, m: string, s = 0) {
      super(m);
      this.code = c;
      this.statusCode = s;
    }
  },
}));

// Mock the session resolver so no real tunnel is hit.
const mockResolveSession = vi.fn();
vi.mock('@/lib/bms-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bms-session')>('@/lib/bms-session');
  return {
    ...actual,
    resolveSessionIdForHospital: (...args: unknown[]) => mockResolveSession(...args),
  };
});

async function seedPendingRow(
  db: PgliteAdapter,
  hospitalId: string,
  overrides: Partial<{
    recipientCid: string;
    severity: string;
    ruleId: string;
    recipientScope: string;
    alertSource: string;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO moph_alert_log
       (id, case_id, hospital_id, origin_hcode, recipient_cid, recipient_scope,
        alert_source, severity, rule_id, title, status, attempts, local_date,
        created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',0,$11,NOW(),NOW())`,
    [
      id,
      overrides.severity === 'emergency' ? 'case-em' : 'case-high',
      hospitalId,
      '10682',
      overrides.recipientCid ?? '3320500282121',
      overrides.recipientScope ?? 'hospital_staff',
      overrides.alertSource ?? 'anc_cpd',
      overrides.severity ?? 'high',
      overrides.ruleId ?? 'cpd_high',
      'แจ้งเตือน',
      '2026-07-26',
    ],
  );
  return id;
}

describe('drainMophAlerts', () => {
  let db: PgliteAdapter;
  let hospitalId: string;

  beforeEach(async () => {
    db = new PgliteAdapter(createPglite());
    await SchemaSync.sync(db, ALL_TABLES, 'postgresql');
    hospitalId = randomUUID();
    await db.query(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES ($1,'10682','รพ.ขอนแก่น','P_PLUS','30',true,NOW(),NOW())`,
      [hospitalId],
    );
    mockResolveSession.mockResolvedValue('SESS-FRESH');
    mockSend.mockResolvedValue({
      messageId: 'msg-ok',
      line: { success: true, status: 'success' },
    });
  });
  afterEach(async () => {
    await db.close();
    vi.clearAllMocks();
  });

  it('pops pending rows, sends each, marks sent + message_id', async () => {
    const id = await seedPendingRow(db, hospitalId);
    const summary = await drainMophAlerts(db, hospitalId, {
      maxAlerts: 5,
      perSendTimeoutMs: 1000,
      budgetMs: 5000,
    });
    expect(summary.sent).toBe(1);
    expect(mockSend).toHaveBeenCalledTimes(1);
    const rows = await db.query<{ status: string; message_id: string; api_status: string }>(
      `SELECT status, message_id, api_status FROM moph_alert_log WHERE id = $1`,
      [id],
    );
    expect(rows[0].status).toBe('sent');
    expect(rows[0].message_id).toBe('msg-ok');
    expect(rows[0].api_status).toBe('success');
  });

  it('respects maxAlerts cap — extra rows stay pending', async () => {
    await seedPendingRow(db, hospitalId, { recipientCid: '3320500282121' });
    await seedPendingRow(db, hospitalId, { recipientCid: '3320500282122' });
    await seedPendingRow(db, hospitalId, { recipientCid: '3320500282123' });
    const summary = await drainMophAlerts(db, hospitalId, {
      maxAlerts: 2,
      perSendTimeoutMs: 1000,
      budgetMs: 5000,
    });
    expect(summary.sent).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
    const pending = await db.query<{ c: number }>(
      `SELECT COUNT(*)::int as c FROM moph_alert_log WHERE status='pending'`,
    );
    expect(pending[0].c).toBe(1);
  });

  it('502 → row stays pending, attempts++, last_error set', async () => {
    const id = await seedPendingRow(db, hospitalId);
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('502'), { code: 'RETRYABLE_EXHAUSTED', statusCode: 502 }),
    );
    const summary = await drainMophAlerts(db, hospitalId, {
      maxAlerts: 5,
      perSendTimeoutMs: 1000,
      budgetMs: 5000,
    });
    expect(summary.sent).toBe(0);
    expect(summary.retryable).toBe(1);
    const rows = await db.query<{ status: string; attempts: number; last_error: string | null }>(
      `SELECT status, attempts, last_error FROM moph_alert_log WHERE id = $1`,
      [id],
    );
    expect(rows[0].status).toBe('pending');
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].last_error).not.toBeNull();
  });

  it('400 → row marked failed (terminal), not retried', async () => {
    const id = await seedPendingRow(db, hospitalId);
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('bad cid'), { code: 'CLIENT_ERROR', statusCode: 400 }),
    );
    const summary = await drainMophAlerts(db, hospitalId, {
      maxAlerts: 5,
      perSendTimeoutMs: 1000,
      budgetMs: 5000,
    });
    expect(summary.failed).toBe(1);
    const rows = await db.query<{ status: string; attempts: number }>(
      `SELECT status, attempts FROM moph_alert_log WHERE id = $1`,
      [id],
    );
    expect(rows[0].status).toBe('failed');
    expect(rows[0].attempts).toBe(1);
  });

  it('drain failure does not throw to caller (returns summary)', async () => {
    await seedPendingRow(db, hospitalId);
    mockSend.mockRejectedValueOnce(new Error('unexpected'));
    await expect(
      drainMophAlerts(db, hospitalId, { maxAlerts: 5, perSendTimeoutMs: 1000, budgetMs: 5000 }),
    ).resolves.toBeDefined();
  });

  it('re-derives a fresh session via resolveSessionIdForHospital before sending', async () => {
    await seedPendingRow(db, hospitalId);
    await drainMophAlerts(db, hospitalId, { maxAlerts: 5, perSendTimeoutMs: 1000, budgetMs: 5000 });
    expect(mockResolveSession).toHaveBeenCalledWith(expect.anything(), hospitalId);
    // the sender received the fresh session as Bearer
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'SESS-FRESH' }));
  });

  it('no pending rows → no sends, empty summary', async () => {
    const summary = await drainMophAlerts(db, hospitalId, {
      maxAlerts: 5,
      perSendTimeoutMs: 1000,
      budgetMs: 5000,
    });
    expect(summary.sent).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
  });
});
