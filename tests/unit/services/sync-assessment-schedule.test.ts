// Server-side assessment sync timer — the [LR] maternity forms keep syncing
// even when no ward tab is open.
//
// The rules under test:
//   1. Only a hospital that can be pulled IS pulled: active, with a tunnel
//      URL, and not purged (data_purged_at set).
//   2. ONE hospital's failure never stops the others, and the pass never
//      throws.
//   3. A pull that is still running is never started a second time — the next
//      tick skips the hospital instead of overlapping it.
//   4. The schedule registers ONE timer, is idempotent, and stop() clears it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import type { AssessmentSyncResult } from '@/services/sync/maternity-assessment';
import { logger } from '@/lib/logger';

vi.mock('@/services/sync/maternity-assessment', () => ({
  pullMaternityAssessmentsFromHosxp: vi.fn(),
}));

import { pullMaternityAssessmentsFromHosxp } from '@/services/sync/maternity-assessment';
import {
  ASSESSMENT_SYNC_INTERVAL_MS,
  runAssessmentSyncOnce,
  scheduleAssessmentSync,
  stopAssessmentSync,
} from '@/services/sync/assessment-schedule';

const pullMock = vi.mocked(pullMaternityAssessmentsFromHosxp);

let db: DatabaseAdapter;

/** A pull result with the given counts. */
function pullResult(overrides: Partial<AssessmentSyncResult> = {}): AssessmentSyncResult {
  return {
    upserted: 0,
    skipped: 0,
    failed: 0,
    deleted: 0,
    persistedPks: {},
    unusablePks: {},
    failedPks: {},
    failedForms: [],
    error: null,
    metadataError: null,
    reconcileError: null,
    ...overrides,
  };
}

interface SeedOptions {
  id: string;
  hcode: string;
  /** Omit to leave the hospital without a hospital_bms_config row. */
  tunnelUrl?: string | null;
  isActive?: boolean;
  /** Set to a timestamp to mark the hospital's data as purged. */
  purgedAt?: string | null;
}

async function seedHospital(opts: SeedOptions): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
     VALUES (?, ?, ?, 'M1', ?, 'UNKNOWN', ?, ?)`,
    [
      opts.id,
      opts.hcode,
      `hospital ${opts.hcode}`,
      opts.isActive ?? true,
      now,
      now,
    ],
  );
  if (opts.tunnelUrl === undefined) return;
  await db.execute(
    `INSERT INTO hospital_bms_config
       (id, hospital_id, tunnel_url, data_purged_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [`hbc-${opts.id}`, opts.id, opts.tunnelUrl, opts.purgedAt ?? null, now, now],
  );
}

/** The ids of the hospitals a pass pulled. */
function pulledHospitalIds(): string[] {
  return pullMock.mock.calls.map((call) => String(call[1]));
}

beforeEach(async () => {
  db = await createTestDb();
  pullMock.mockReset();
  pullMock.mockResolvedValue(pullResult());
});

afterEach(() => {
  stopAssessmentSync();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('runAssessmentSyncOnce', () => {
  it('pulls a hospital that has a tunnel URL', async () => {
    await seedHospital({ id: 'h-asm-ok', hcode: '90001', tunnelUrl: 'https://tunnel.test' });

    await runAssessmentSyncOnce(db);

    expect(pulledHospitalIds()).toEqual(['h-asm-ok']);
  });

  it('does not pull a hospital without a tunnel URL', async () => {
    await seedHospital({ id: 'h-asm-no-config', hcode: '90002' });
    await seedHospital({ id: 'h-asm-empty-url', hcode: '90003', tunnelUrl: '' });

    await runAssessmentSyncOnce(db);

    expect(pullMock).not.toHaveBeenCalled();
  });

  it('does not pull a hospital whose data was purged', async () => {
    await seedHospital({
      id: 'h-asm-purged',
      hcode: '90004',
      tunnelUrl: 'https://tunnel.test',
      purgedAt: '2026-11-01T00:00:00.000Z',
    });
    await seedHospital({ id: 'h-asm-live', hcode: '90005', tunnelUrl: 'https://tunnel.test' });

    await runAssessmentSyncOnce(db);

    expect(pulledHospitalIds()).toEqual(['h-asm-live']);
  });

  it('does not pull an inactive hospital', async () => {
    await seedHospital({
      id: 'h-asm-inactive',
      hcode: '90006',
      tunnelUrl: 'https://tunnel.test',
      isActive: false,
    });
    await seedHospital({ id: 'h-asm-active', hcode: '90007', tunnelUrl: 'https://tunnel.test' });

    await runAssessmentSyncOnce(db);

    expect(pulledHospitalIds()).toEqual(['h-asm-active']);
  });

  it('keeps going when one hospital fails, and never throws', async () => {
    await seedHospital({ id: 'h-asm-fail', hcode: '90008', tunnelUrl: 'https://tunnel.test' });
    await seedHospital({ id: 'h-asm-ok2', hcode: '90009', tunnelUrl: 'https://tunnel.test' });
    pullMock.mockImplementation(async (_db, hospitalId) => {
      if (hospitalId === 'h-asm-fail') throw new Error('tunnel unreachable');
      return pullResult({ upserted: 3 });
    });
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});

    await expect(runAssessmentSyncOnce(db)).resolves.toBeUndefined();

    // The healthy hospital was still pulled.
    expect(pulledHospitalIds().sort()).toEqual(['h-asm-fail', 'h-asm-ok2']);
    expect(errorSpy).toHaveBeenCalledWith(
      'assessment_scheduled_sync_failed',
      expect.objectContaining({ hospitalId: 'h-asm-fail' }),
    );
  });

  it('logs the outcome of a successful pull', async () => {
    await seedHospital({ id: 'h-asm-log', hcode: '90010', tunnelUrl: 'https://tunnel.test' });
    pullMock.mockResolvedValue(pullResult({ upserted: 7, failedForms: ['asm_first_pregnant_pt_nan'] }));
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});

    await runAssessmentSyncOnce(db);

    expect(infoSpy).toHaveBeenCalledWith(
      'assessment_scheduled_sync',
      expect.objectContaining({
        hospitalId: 'h-asm-log',
        upserted: 7,
        failedForms: ['asm_first_pregnant_pt_nan'],
      }),
    );
  });

  it('does not start a second pull while the first is still running', async () => {
    await seedHospital({ id: 'h-asm-slow', hcode: '90011', tunnelUrl: 'https://tunnel.test' });
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    pullMock.mockImplementation(async () => {
      await gate;
      return pullResult();
    });

    // The first pass hangs on the pull — it is never awaited here.
    const first = runAssessmentSyncOnce(db);
    await vi.waitFor(() => expect(pullMock).toHaveBeenCalledTimes(1));

    // The next tick must not start the same pull again.
    await runAssessmentSyncOnce(db);
    expect(pullMock).toHaveBeenCalledTimes(1);

    release();
    await first;

    // Once the pull is done the hospital is eligible again.
    await runAssessmentSyncOnce(db);
    expect(pullMock).toHaveBeenCalledTimes(2);
  });

  it('reconciles once, not on every tick', async () => {
    // The reconciliation pass re-reads a window of rows and finds nothing
    // most of the time — it runs once an hour per hospital.
    await seedHospital({ id: 'h-asm-recon', hcode: '90020', tunnelUrl: 'https://tunnel.test' });

    await runAssessmentSyncOnce(db);
    await runAssessmentSyncOnce(db);

    expect(pullMock.mock.calls[0][2]).toMatchObject({ reconcile: true });
    expect(pullMock.mock.calls[1][2]).toMatchObject({ reconcile: false });
  });

  it('tries the reconciliation again after it failed', async () => {
    await seedHospital({ id: 'h-asm-recon-fail', hcode: '90021', tunnelUrl: 'https://tunnel.test' });
    pullMock.mockResolvedValue(pullResult({ reconcileError: 'window query failed' }));

    await runAssessmentSyncOnce(db);
    pullMock.mockResolvedValue(pullResult());
    await runAssessmentSyncOnce(db);

    // A pass that failed is not marked as done — the next tick tries again.
    expect(pullMock.mock.calls[0][2]).toMatchObject({ reconcile: true });
    expect(pullMock.mock.calls[1][2]).toMatchObject({ reconcile: true });
  });
});

describe('scheduleAssessmentSync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  it('registers one timer and is idempotent', async () => {
    await seedHospital({ id: 'h-asm-timer', hcode: '90012', tunnelUrl: 'https://tunnel.test' });

    scheduleAssessmentSync(db);
    const timers = vi.getTimerCount();
    expect(timers).toBe(1);

    // A second call (a dev hot reload) must not add a second timer.
    scheduleAssessmentSync(db);
    expect(vi.getTimerCount()).toBe(timers);

    stopAssessmentSync();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops the pull from firing after stop', async () => {
    await seedHospital({ id: 'h-asm-stopped', hcode: '90013', tunnelUrl: 'https://tunnel.test' });

    scheduleAssessmentSync(db);
    stopAssessmentSync();
    await vi.advanceTimersByTimeAsync(ASSESSMENT_SYNC_INTERVAL_MS * 3);

    expect(pullMock).not.toHaveBeenCalled();
  });

  it('runs the pull when the interval elapses', async () => {
    await seedHospital({ id: 'h-asm-run', hcode: '90014', tunnelUrl: 'https://tunnel.test' });

    scheduleAssessmentSync(db);
    await vi.advanceTimersByTimeAsync(ASSESSMENT_SYNC_INTERVAL_MS);

    expect(pulledHospitalIds()).toEqual(['h-asm-run']);
  });
});
