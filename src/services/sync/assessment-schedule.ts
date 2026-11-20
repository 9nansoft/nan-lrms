// Server-side schedule for the maternity assessment (LR) pull.
//
// The [LR] forms used to reach the cache only when a ward tab was open: the
// browser asked HOSxP for the rows and pushed them. A ward with no tab open
// therefore had no forms at all, and the forms only caught up when somebody
// happened to look at the board.
//
// This scheduler pulls the forms on its own, so the cache is filled whether or
// not a browser is watching. It is deliberately SEPARATE from the legacy
// patient polling, which runs in the browser (see the note in
// src/app/api/startup.ts): this timer only ever touches the assessment forms.
//
// Two properties matter here:
//
//  1. A hospital's failure must never take the others down. One hospital's
//     tunnel being down is a normal condition, not an outage.
//  2. A slow pull must never overlap the next tick: the same hospital would
//     then be pulled twice at once, and the two pulls would race on the same
//     cursor.
import type { DatabaseAdapter } from '@/db/adapter';
import {
  pullMaternityAssessmentsFromHosxp,
  runAssessmentPullExclusively,
} from './maternity-assessment';
import { ASSESSMENT_RECONCILE_INTERVAL_MS } from '@/config/maternity-assessments';
import { logger } from '@/lib/logger';

/**
 * How often the assessment forms are pulled.
 *
 * The forms change a few times a day, so a 5-minute cadence is already far
 * more often than the data changes. The pull is cursor-driven — a cycle that
 * finds nothing new costs one cheap query per form — so the repeat costs
 * almost nothing and keeps the cache warm instead of catching up in a burst.
 */
export const ASSESSMENT_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/**
 * When each hospital's reconciliation pass last ran.
 *
 * The reconciliation pass re-reads a window of rows and drops the cached
 * rows HOSxP no longer has. It is far more work than the incremental pull
 * and finds nothing most of the time, so it runs once an hour per hospital
 * instead of on every tick.
 */
const lastReconcileAt = new Map<string, number>();

/**
 * True when the hospital's reconciliation pass is due.
 *
 * A hospital that is new, or whose last pass failed, is due right away: the
 * pass is marked as done only when it actually ran.
 */
function isReconcileDue(hospitalId: string, now: number): boolean {
  const last = lastReconcileAt.get(hospitalId);
  if (last === undefined) return true;
  return now - last >= ASSESSMENT_RECONCILE_INTERVAL_MS;
}

/** The message of a thrown value, for the logs. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The hospitals this timer may pull: active, with a tunnel URL to reach
 * HOSxP through, and not purged.
 *
 * A purged hospital (data_purged_at set — its data was deleted on request)
 * is skipped like every other sync path skips it: the hospital must be
 * re-onboarded before its data comes back.
 */
async function selectPullableHospitals(db: DatabaseAdapter): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT h.id
       FROM hospitals h
       JOIN hospital_bms_config c ON c.hospital_id = h.id
      WHERE h.is_active = true
        AND c.tunnel_url IS NOT NULL
        AND TRIM(c.tunnel_url) <> ''
        AND c.data_purged_at IS NULL
      ORDER BY h.id`,
  );
  return rows.map((row) => row.id);
}

/**
 * Pull one hospital's forms. Never throws — a failure is logged and the
 * other hospitals carry on.
 *
 * The pull runs under the SHARED per-hospital lock (see
 * runAssessmentPullExclusively), so it also steps aside for a browser/agent
 * push or a backstop pull that is mid-flight — not only for the scheduler's
 * own previous tick.
 */
async function pullHospital(db: DatabaseAdapter, hospitalId: string): Promise<void> {
  const reconcile = isReconcileDue(hospitalId, Date.now());
  let result: Awaited<ReturnType<typeof pullMaternityAssessmentsFromHosxp>> | null;
  try {
    result = await runAssessmentPullExclusively(hospitalId, () =>
      pullMaternityAssessmentsFromHosxp(db, hospitalId, { reconcile }),
    );
  } catch (error) {
    logger.error('assessment_scheduled_sync_failed', {
      hospitalId,
      error: errorMessage(error),
    });
    return;
  }
  if (result === null) {
    // Another pull for this hospital is still running — the scheduler's own
    // previous tick, a push, or the backstop. Starting a second one would
    // race it on the same cursor.
    logger.debug('assessment_scheduled_sync_skipped', { hospitalId });
    return;
  }
  if (reconcile && result.reconcileError === null) {
    // The pass ran and did not fail — the next one is an hour away. A pass
    // that failed is NOT marked as done: the next tick tries again.
    lastReconcileAt.set(hospitalId, Date.now());
  }
  logger.info('assessment_scheduled_sync', {
    hospitalId,
    upserted: result.upserted,
    deleted: result.deleted,
    purged: result.purged,
    failedForms: result.failedForms,
    metadataError: result.metadataError,
    reconcileError: result.reconcileError,
  });
}

/**
 * One pass over the hospitals: every pullable hospital is pulled once.
 *
 * Never throws — a failure is logged and the pass carries on. The hospitals
 * are pulled concurrently so one hospital's slow tunnel does not hold the
 * others back.
 */
export async function runAssessmentSyncOnce(db: DatabaseAdapter): Promise<void> {
  let hospitalIds: string[];
  try {
    hospitalIds = await selectPullableHospitals(db);
  } catch (error) {
    logger.error('assessment_scheduled_sync_failed', { error: errorMessage(error) });
    return;
  }

  await Promise.allSettled(hospitalIds.map((hospitalId) => pullHospital(db, hospitalId)));
}

// --- In-process scheduling --------------------------------------------------

interface AssessmentScheduleState {
  /** The timer of the first run. */
  initialTimer: ReturnType<typeof setTimeout>;
  /** The timer of the repeats — armed once the first run has fired. */
  interval?: ReturnType<typeof setInterval>;
}

// HMR-safe: pin the timer handles on globalThis (same pattern as the audit
// retention schedule in src/services/audit-retention.ts) so a Next.js dev
// reload doesn't register a second competing timer on top of the one from the
// previous module instance.
const _global = globalThis as unknown as { __assessmentSyncSchedule?: AssessmentScheduleState };

/**
 * Registers the assessment pull: one run one interval from now (NOT awaited by
 * the caller — a pull talks to HOSxP and must not delay the startup path),
 * then a run every ASSESSMENT_SYNC_INTERVAL_MS for the life of the process.
 *
 * Idempotent — a second call while a schedule is already registered (an HMR
 * reload in dev) is a no-op. Both timers are `.unref?.()`d so they never hold
 * a short-lived process (tests, CLI) open.
 */
export function scheduleAssessmentSync(db: DatabaseAdapter): void {
  if (_global.__assessmentSyncSchedule) return;

  const runOnce = (): void => {
    // runAssessmentSyncOnce() already catches internally and never rejects;
    // this .catch is defense in depth against an unhandled-rejection crash
    // if that contract ever changes.
    runAssessmentSyncOnce(db).catch((error) => {
      logger.error('assessment_scheduled_sync_failed', { error: errorMessage(error) });
    });
  };

  const initialTimer = setTimeout(() => {
    const state = _global.__assessmentSyncSchedule;
    // Stopped while the first run was still pending — do not arm the repeats.
    if (!state) return;
    runOnce();
    // The repeats are armed AFTER the first run: arming the interval at the
    // same instant would land the first tick and the first interval on the
    // same moment, and one window would pull every hospital twice.
    const interval = setInterval(runOnce, ASSESSMENT_SYNC_INTERVAL_MS);
    interval.unref?.();
    state.interval = interval;
  }, ASSESSMENT_SYNC_INTERVAL_MS);
  initialTimer.unref?.();

  _global.__assessmentSyncSchedule = { initialTimer };
}

/**
 * Tears down the scheduled timers — mirrors stopAuditLogRetentionSchedule() in
 * src/services/audit-retention.ts. Called from shutdownApp() on graceful
 * shutdown, and from tests that need a clean globalThis slate between runs.
 */
export function stopAssessmentSync(): void {
  const state = _global.__assessmentSyncSchedule;
  if (!state) return;
  clearTimeout(state.initialTimer);
  if (state.interval) clearInterval(state.interval);
  _global.__assessmentSyncSchedule = undefined;
}
