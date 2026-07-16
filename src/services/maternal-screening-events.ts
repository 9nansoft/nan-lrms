// Maternal labor-triage screening — gated SSE state-change event helpers
// (Task 8, docs/superpowers/plans/2026-07-16-maternal-screening.md, spec
// §10.4).
//
// Kept OUT of maternal-screening-store.ts on purpose: that module is
// deliberately event-free (see its header comment) so its db.transaction
// commits BEFORE any broadcast happens (GC6 post-commit ordering — copy of
// the webhook.ts post-commit pattern). This module owns only:
//   1. the PURE transition decision (`shouldEmitMaternalScreenTransition`),
//      unit-testable with no DB/SSE dependency; and
//   2. a pure constructor for the broadcast payload
//      (`buildMaternalScreenStateChangedEvent`), PHI-free by construction.
// The actual `SseManager.broadcast()` call — and the
// `isMaternalScreenEventsEnabled()` gate — stay in webhook.ts's Task 7
// ingest block, AFTER `saveMaternalScreenAssessment` has already committed.
import type {
  MaternalEmergencyAcuity,
  MaternalScreenLocalTier,
  SuspectedMaternalCondition,
} from '@/types/maternal-screening';
import type { MaternalScreenStateChangedEvent } from '@/types/api';

/**
 * The maternal-screen summary axes for one admission, read from
 * `cached_patients` BEFORE a new assessment is saved (or absent entirely).
 * `null` means "no assessment existed yet" — NEVER a normal/stable finding
 * (GC1: absence must never be fabricated into a reassuring result).
 */
export interface MaternalScreenPreviousSummary {
  localTier: MaternalScreenLocalTier | null;
  emergencyAcuity: MaternalEmergencyAcuity | null;
}

/** The server-evaluated result of the assessment that was just saved. */
export interface MaternalScreenNewSummary {
  localTier: MaternalScreenLocalTier;
  emergencyAcuity: MaternalEmergencyAcuity;
}

/**
 * True only for a MEANINGFUL state transition — `localTier` changed OR
 * `emergencyAcuity` changed (spec §10.4: "only for a meaningful state
 * transition. Replayed idempotent payloads must not emit duplicate
 * events."). An assessment that lands on the exact same tier/acuity as the
 * admission's current summary (including the very first assessment landing
 * on `NO_LOCAL_MATCH`/`STABLE` when the previous summary was already `null`
 * — i.e. no prior assessment — DOES count as a transition, since `null` is
 * never equal to a proven enum value) emits nothing.
 */
export function shouldEmitMaternalScreenTransition(
  prev: MaternalScreenPreviousSummary,
  next: MaternalScreenNewSummary,
): boolean {
  return prev.localTier !== next.localTier || prev.emergencyAcuity !== next.emergencyAcuity;
}

export interface BuildMaternalScreenEventParams {
  /** cached_patients.id of the labor admission (same id passed as
   *  `laborAdmissionId` to `saveMaternalScreenAssessment`). */
  patientId: string;
  previous: MaternalScreenPreviousSummary;
  localTier: MaternalScreenLocalTier;
  emergencyAcuity: MaternalEmergencyAcuity;
  isComplete: boolean;
  suspectedConditions: SuspectedMaternalCondition[];
  assessedAt: string;
}

/**
 * Pure constructor for the `patient-update` broadcast payload. PHI-free by
 * construction — only ids, enums, booleans, and an ISO timestamp; never
 * name/cid/free-text (GC6).
 */
export function buildMaternalScreenStateChangedEvent(
  params: BuildMaternalScreenEventParams,
): MaternalScreenStateChangedEvent {
  return {
    type: 'maternal_screen_state_changed',
    patientId: params.patientId,
    previousLocalTier: params.previous.localTier,
    localTier: params.localTier,
    previousEmergencyAcuity: params.previous.emergencyAcuity,
    emergencyAcuity: params.emergencyAcuity,
    isComplete: params.isComplete,
    suspectedConditions: params.suspectedConditions,
    assessedAt: params.assessedAt,
  };
}
