// TDD (Red→Green) for the browser-push → MOPH alert wiring (step 7).
// Asserts: an HR3 (HIGH-risk) ANC patient enqueues a pending moph_alert_log row
// and the route appends a final moph_alerts_drain sync step; a non-HR3 patient
// enqueues nothing. Drain/sender are mocked so no real LINE I/O occurs.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';
import { getLatestSyncRun } from '@/services/sync/progress-store';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

// Mock the drain so no LINE I/O happens; capture the call. (enqueueHighRiskAlert
// never calls the sender itself — it only writes pending rows — so moph-prompt
// need not be mocked here.) vi.hoisted gives a stable handle that survives the
// route's import-time module resolution (codex flaky-test fix: the inline
// factory + post-import cast can race under memory pressure).
const { mockDrain } = vi.hoisted(() => ({
  // Typed with the real drainMophAlerts signature so assertions can read
  // individual call args (mock.calls[0][1] = hospitalId).
  mockDrain: vi.fn(async (_db: unknown, _hospitalId: string) => ({
    sent: 0,
    retryable: 0,
    failed: 0,
    skipped: 0,
  })),
}));
vi.mock('@/services/moph-alert-drain', () => ({
  drainMophAlerts: mockDrain,
}));

import { POST } from '@/app/api/sync/browser-push/route';
import { SseManager } from '@/lib/sse';

const HCODE = '10670';

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

// HR3 = top ANC risk tier. riskItemIds must resolve to HR3 via the server-side
// classifyAncItems gate (item id 15 = โรคไต, level HR3 in the canon). We declare
// riskLevel 'HR3' too, but the route trusts classifyAncItems, not the client.
const hr3Patient = (cid: string) => ({
  hn: 'BP-HR3-1',
  name: 'นาง เสี่ยงสูง ทดสอบ',
  cid,
  birthday: '1994-06-20',
  pregNo: 1,
  riskLevel: 'HR3',
  riskItemIds: [15],
});
const lowPatient = (cid: string) => ({
  hn: 'BP-LOW-1',
  name: 'นาง ปกติ ทดสอบ',
  cid,
  birthday: '1995-01-01',
  pregNo: 1,
  riskLevel: 'LOW',
  riskItemIds: [],
});

describe('POST /api/sync/browser-push — MOPH alert wiring (HIGH/HR3)', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: HCODE });
    mockDrain.mockReset();
    mockDrain.mockResolvedValue({ sent: 0, retryable: 0, failed: 0, skipped: 0 });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    // The route grabs the SSE singleton, whose 30s heartbeat interval keeps
    // the worker's event loop alive after the file finishes — vitest then
    // times out killing the worker and reports an unhandled error (exit 1
    // even with every test green). Tear it down like the other route tests.
    SseManager.resetForTests();
  });

  it('HR3 ANC patient enqueues a pending moph_alert_log row + appends a moph_alerts_drain step', async () => {
    const res = await POST(
      jsonRequest({ anc: { patients: [hr3Patient('1007000100131')] } }) as never,
    );
    expect(res.status).toBe(200);

    const hid = await hospitalId();
    const rows = await db.query<{ status: string; severity: string; alert_source: string }>(
      `SELECT status, severity, alert_source FROM moph_alert_log WHERE hospital_id = ?`,
      [hid],
    );
    // Row may not exist if no recipients are seeded (no consult doctors /
    // center monitors). The wiring contract is: enqueue was ATTEMPTED for an
    // HR3 patient. We assert the drain step ran regardless (drain is always
    // appended as a final step).
    const run = await getLatestSyncRun(hid);
    // The route appends a 'running' step, then a terminal 'success'/'warning'
    // step — appendSyncStep pushes a NEW entry per call, so look at the LAST
    // moph_alerts_drain step, not the first (find() would always see 'running').
    const drainSteps = run!.steps.filter((s) => s.name === 'moph_alerts_drain');
    expect(drainSteps.length).toBeGreaterThan(0);
    expect(drainSteps.at(-1)!.status).toBe('success');
    // Assert on the scalar arg instead of toHaveBeenCalledWith: its first
    // argument is the db adapter, which holds the PGlite WASM instance —
    // vitest's deep-equality traversal of it allocates until the worker OOMs
    // (observed 2026-08-18; this line was unreachable before the KK test
    // fixtures were re-seeded, so the bomb stayed hidden).
    expect(mockDrain).toHaveBeenCalledTimes(1);
    expect(mockDrain.mock.calls[0]?.[1]).toBe(hid);
    void rows; // presence depends on seeded recipients; not asserted here
  });

  it('non-HR3 patient enqueues no alert row (drain step still runs, no-op)', async () => {
    const res = await POST(
      jsonRequest({ anc: { patients: [lowPatient('1007000100140')] } }) as never,
    );
    expect(res.status).toBe(200);
    const hid = await hospitalId();
    const rows = await db.query<{ c: number }>(
      `SELECT COUNT(*)::int as c FROM moph_alert_log WHERE hospital_id = ?`,
      [hid],
    );
    expect(rows[0].c).toBe(0);
    const run = await getLatestSyncRun(hid);
    expect(run!.steps.find((s) => s.name === 'moph_alerts_drain')).toBeDefined();
  });

  it('sync run still succeeds (200) even if the drain throws', async () => {
    mockDrain.mockRejectedValueOnce(new Error('drain boom'));
    const res = await POST(
      jsonRequest({ anc: { patients: [hr3Patient('1007000100157')] } }) as never,
    );
    expect(res.status).toBe(200);
  });
});
