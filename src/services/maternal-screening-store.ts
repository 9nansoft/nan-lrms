// Maternal labor-triage screening — transactional persistence store (Task 6,
// docs/superpowers/plans/2026-07-16-maternal-screening.md).
//
// STATUS: PROVISIONAL / INERT. Nothing calls this yet — Task 7 wires the
// webhook/browser-push ingest. The write is deliberately self-contained (no
// SSE, no notifications) so Task 7 can emit events strictly AFTER this
// module's transaction commits (GC6, spec §8.3 — copy of the webhook.ts
// post-commit ordering at src/services/webhook.ts:1097).
//
// Contract (GC1/GC2/GC5/GC6):
// - The server ALWAYS recomputes localTier/emergencyAcuity/isComplete via
//   `evaluateMaternalScreen` — `SaveMaternalScreenParams` deliberately has NO
//   fields for client-supplied tier/acuity/completeness (GC2, AC #8).
// - Assessments are append-only immutable clinical events. A correction
//   inserts a NEW row with `supersedes_id`; originals are never mutated
//   (GC6, AC #11).
// - The assessment INSERT and the cached_patients summary UPDATE happen in
//   ONE db.transaction. If evaluation throws or any statement fails, the
//   whole write rolls back and an operational error is raised — a fallback
//   NO_LOCAL_MATCH/LOCAL_MILD/STABLE row is NEVER persisted (spec §8.3).
// - Idempotency: replaying the same (hospital_id, source_system, source_pk)
//   is a clean no-op returning the existing row (GC6, AC #10). The unique
//   index idx_msa_hospital_source_pk is defense-in-depth for the race window.
// - Every string column value passes through the fitOrNull guard pattern
//   from src/services/webhook.ts (GC5 — 2026-07-16 ANC field-width incident).
// - Tenant isolation: every read/write is scoped by hospital_id.
// - No PHI (name/cid/free-text) in results, logs, or error messages.
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { evaluateMaternalScreen } from '@/services/maternal-screening';
import type {
  MaternalEmergencyAcuity,
  MaternalScreenInput,
  MaternalScreenLocalTier,
  MaternalScreenResult,
} from '@/types/maternal-screening';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type MaternalScreenStoreErrorCode =
  | 'EVALUATION_FAILED'
  | 'ADMISSION_NOT_FOUND'
  | 'SUPERSEDED_ROW_NOT_FOUND'
  | 'INVALID_PARAMS'
  | 'WRITE_FAILED';

/** Operational error: the write was rejected/rolled back — nothing persisted. */
export class MaternalScreenStoreError extends Error {
  constructor(
    message: string,
    readonly code: MaternalScreenStoreErrorCode,
  ) {
    super(message);
    this.name = 'MaternalScreenStoreError';
  }
}

/**
 * GC2: deliberately NO localTier / emergencyAcuity / isComplete fields — the
 * server recomputes them from `input`; client-supplied values cannot even be
 * expressed here.
 */
export interface SaveMaternalScreenParams {
  hospitalId: string;
  /** cached_patients.id of the labor admission this screening belongs to. */
  laborAdmissionId: string;
  journeyId?: string | null;
  /** e.g. 'WEBHOOK' | 'HOSXP' | 'MANUAL_UI'. */
  sourceSystem: string;
  /** Sender's idempotency key; null for sources without one (e.g. MANUAL_UI). */
  sourcePk?: string | null;
  /** ISO timestamp of the clinical assessment. */
  assessedAt: string;
  /** Actor identity snapshotted inline (nullable, non-FK — audit_logs pattern). */
  assessedBy?: string | null;
  /**
   * ALREADY normalized/typed by the caller (Task 7 runs
   * `normalizeProteinuriaGrade` etc. at the transport boundary).
   */
  input: MaternalScreenInput;
  /** ISO timestamp stamped onto the evaluation (spec §6.2). */
  evaluatedAt: string;
  /**
   * Explicit correction (GC6, AC #11): inserts a NEW row superseding this
   * assessment id; the original row is never mutated. Must reference an
   * assessment of the same hospital AND same labor admission.
   */
  supersedesId?: string | null;
}

export type SaveMaternalScreenStatus = 'created' | 'corrected' | 'duplicate';

/** Structured, PHI-free result (no name/cid/free-text — AC-safe for logs). */
export interface SaveMaternalScreenResult {
  status: SaveMaternalScreenStatus;
  assessmentId: string;
  localTier: MaternalScreenLocalTier;
  emergencyAcuity: MaternalEmergencyAcuity;
  isComplete: boolean;
  ruleSetVersion: string;
}

export interface ReconcileSummaryResult {
  /** 'reconciled' — summary now mirrors the latest non-superseded assessment;
   *  'cleared' — no assessments exist, all six summary columns set to NULL. */
  status: 'reconciled' | 'cleared';
  assessmentId: string | null;
}

// ---------------------------------------------------------------------------
// Column widths — mirror src/db/tables/maternal-screening-assessments.ts and
// src/db/tables/cached-patients.ts. Update BOTH if a table def changes.
// ---------------------------------------------------------------------------

const WIDTHS = {
  sourceSystem: 40,
  sourcePk: 150,
  assessedBy: 150,
  localTier: 30,
  emergencyAcuity: 30,
  ruleSetVersion: 40,
  conditionCodes: 255,
} as const;

// Defense-in-depth against "value too long for type character varying(N)" —
// same guard pattern as src/services/webhook.ts (GC5): an over-long string is
// dropped (null) for THAT FIELD only, counted via a non-PHI log line (never
// the value itself).
function fitOrNull(value: string | null | undefined, max: number, field: string): string | null {
  if (value == null) return null;
  if (value.length <= max) return value;
  logger.warn('maternal_screen_field_length_overflow', { field, length: value.length, max });
  return null;
}

// For NOT NULL columns a silent null would only defer the failure to a
// cryptic DB constraint error — reject up front with an actionable message.
function fitRequired(value: string, max: number, field: string): string {
  const fitted = fitOrNull(value, max, field);
  if (fitted == null) {
    throw new MaternalScreenStoreError(
      `${field} is required and must be at most ${max} characters (got ${
        value == null ? 'null' : `${String(value).length}`
      }) — fix the caller's value; nothing was persisted`,
      'INVALID_PARAMS',
    );
  }
  return fitted;
}

// ---------------------------------------------------------------------------
// Save (insert / correct / idempotent-duplicate)
// ---------------------------------------------------------------------------

interface ExistingAssessmentRow {
  id: string;
  local_tier: string;
  emergency_acuity: string;
  is_complete: boolean;
  rule_set_version: string;
}

const EXISTING_BY_SOURCE_SQL = `
  SELECT id, local_tier, emergency_acuity, is_complete, rule_set_version
    FROM maternal_screening_assessments
   WHERE hospital_id = ? AND source_system = ? AND source_pk = ?
   LIMIT 1`;

function duplicateResult(existing: ExistingAssessmentRow): SaveMaternalScreenResult {
  return {
    status: 'duplicate',
    assessmentId: existing.id,
    // Stored values were engine-produced by a previous save — safe narrowing.
    localTier: existing.local_tier as MaternalScreenLocalTier,
    emergencyAcuity: existing.emergency_acuity as MaternalEmergencyAcuity,
    isComplete: existing.is_complete,
    ruleSetVersion: existing.rule_set_version,
  };
}

/** True when `err` is the idx_msa_hospital_source_pk unique-index violation
 *  (the idempotency race: two concurrent saves passed the SELECT check). */
function isSourcePkUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const constraint = (err as Error & { constraint?: string }).constraint;
  return constraint === 'idx_msa_hospital_source_pk' || err.message.includes('idx_msa_hospital_source_pk');
}

/**
 * Persist one maternal screening assessment: server-side evaluation + atomic
 * write of the immutable assessment row AND the cached_patients summary
 * projection, with idempotency, correction/supersession, and
 * rollback-on-failure. See the module header for the full contract.
 */
export async function saveMaternalScreenAssessment(
  db: DatabaseAdapter,
  params: SaveMaternalScreenParams,
): Promise<SaveMaternalScreenResult> {
  const sourceSystem = fitRequired(params.sourceSystem, WIDTHS.sourceSystem, 'source_system');
  const sourcePk = fitOrNull(params.sourcePk, WIDTHS.sourcePk, 'source_pk');

  try {
    return await db.transaction(async (tx) => {
      // 1. Idempotency (GC6, AC #10): a replay of the same
      //    (hospital_id, source_system, source_pk) inserts nothing and leaves
      //    the summary untouched. Scoped by hospital_id (tenant isolation).
      if (sourcePk != null) {
        const existing = await tx.query<ExistingAssessmentRow>(EXISTING_BY_SOURCE_SQL, [
          params.hospitalId,
          sourceSystem,
          sourcePk,
        ]);
        if (existing.length > 0) return duplicateResult(existing[0]);
      }

      // 2. Tenant isolation: the admission row must exist AND belong to the
      //    calling hospital — one hospital never writes another's rows.
      const admission = await tx.query<{ id: string }>(
        `SELECT id FROM cached_patients WHERE id = ? AND hospital_id = ?`,
        [params.laborAdmissionId, params.hospitalId],
      );
      if (admission.length === 0) {
        throw new MaternalScreenStoreError(
          `labor admission ${params.laborAdmissionId} not found for hospital ${params.hospitalId} — verify the admission id and that it belongs to this hospital`,
          'ADMISSION_NOT_FOUND',
        );
      }

      // 3. Correction target (GC6, AC #11): must be an assessment of the SAME
      //    hospital and SAME admission. The original is only referenced —
      //    never mutated.
      if (params.supersedesId != null) {
        const target = await tx.query<{ id: string; labor_admission_id: string }>(
          `SELECT id, labor_admission_id FROM maternal_screening_assessments
            WHERE id = ? AND hospital_id = ?`,
          [params.supersedesId, params.hospitalId],
        );
        if (target.length === 0) {
          throw new MaternalScreenStoreError(
            `correction target ${params.supersedesId} not found for hospital ${params.hospitalId} — supersedesId must reference an existing assessment of the same hospital`,
            'SUPERSEDED_ROW_NOT_FOUND',
          );
        }
        if (target[0].labor_admission_id !== params.laborAdmissionId) {
          throw new MaternalScreenStoreError(
            `correction target ${params.supersedesId} belongs to a different labor admission — a correction must supersede an assessment of the same admission`,
            'INVALID_PARAMS',
          );
        }
      }

      // 4. Server-side evaluation, ALWAYS recomputed from raw input (GC2,
      //    AC #8). A throw here aborts the transaction: no assessment row, no
      //    summary mutation, and NEVER a fallback
      //    NO_LOCAL_MATCH/LOCAL_MILD/STABLE row (GC6, spec §8.3).
      let result: MaternalScreenResult;
      try {
        result = evaluateMaternalScreen(params.input, params.evaluatedAt);
      } catch (err) {
        const reason = err instanceof Error ? err.message.slice(0, 200) : 'unknown error';
        throw new MaternalScreenStoreError(
          `evaluation failed — assessment rejected, nothing persisted (never storing a fallback result): ${reason}`,
          'EVALUATION_FAILED',
        );
      }

      // 5. Immutable assessment row (append-only — GC6).
      const assessmentId = uuidv4();
      const now = new Date().toISOString();
      await tx.execute(
        `INSERT INTO maternal_screening_assessments (
           id, labor_admission_id, hospital_id, journey_id, source_system, source_pk,
           assessed_at, assessed_by, input_json, local_tier, emergency_acuity, is_complete,
           suspected_conditions_json, matches_json, missing_fields_json, rule_set_version,
           supersedes_id, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assessmentId,
          params.laborAdmissionId,
          params.hospitalId,
          params.journeyId ?? null,
          sourceSystem,
          sourcePk,
          params.assessedAt,
          fitOrNull(params.assessedBy, WIDTHS.assessedBy, 'assessed_by'),
          JSON.stringify(params.input), // immutable normalized input snapshot
          fitRequired(result.localTier, WIDTHS.localTier, 'local_tier'),
          fitRequired(result.emergencyAcuity, WIDTHS.emergencyAcuity, 'emergency_acuity'),
          result.isComplete,
          JSON.stringify(result.suspectedConditions),
          JSON.stringify(result.matches),
          JSON.stringify(result.missingRequiredFields),
          fitRequired(result.ruleSetVersion, WIDTHS.ruleSetVersion, 'rule_set_version'),
          params.supersedesId ?? null,
          now,
        ],
      );

      // 6. Summary projection — same transaction (GC6), same rule as
      //    reconcileLatestSummary (constitution III: one projection rule).
      await projectLatestSummary(tx, params.laborAdmissionId);

      return {
        status: params.supersedesId != null ? 'corrected' : 'created',
        assessmentId,
        localTier: result.localTier,
        emergencyAcuity: result.emergencyAcuity,
        isComplete: result.isComplete,
        ruleSetVersion: result.ruleSetVersion,
      };
    });
  } catch (err) {
    // Race-safe idempotency: a concurrent save slipped between our SELECT and
    // INSERT and the unique index (defense-in-depth) fired. Treat the replay
    // as the clean no-op it is (GC6, AC #10).
    if (sourcePk != null && isSourcePkUniqueViolation(err)) {
      const existing = await db.query<ExistingAssessmentRow>(EXISTING_BY_SOURCE_SQL, [
        params.hospitalId,
        sourceSystem,
        sourcePk,
      ]);
      if (existing.length > 0) return duplicateResult(existing[0]);
    }

    // Operational error path (spec §8.3) — non-PHI structured log, then raise.
    logger.error('maternal_screen_store_failed', {
      hospitalId: params.hospitalId,
      laborAdmissionId: params.laborAdmissionId,
      sourceSystem,
      code: err instanceof MaternalScreenStoreError ? err.code : 'WRITE_FAILED',
    });
    if (err instanceof MaternalScreenStoreError) throw err;
    const reason = err instanceof Error ? err.message.slice(0, 300) : 'unknown error';
    throw new MaternalScreenStoreError(
      `maternal screening assessment write failed and was rolled back (no assessment row, no summary change) — retry after fixing the cause: ${reason}`,
      'WRITE_FAILED',
    );
  }
}

// ---------------------------------------------------------------------------
// Summary projection / reconciliation (AC #12)
// ---------------------------------------------------------------------------

interface LatestAssessmentRow {
  id: string;
  local_tier: string;
  emergency_acuity: string;
  is_complete: boolean;
  suspected_conditions_json: unknown;
  assessed_at: string | Date;
  rule_set_version: string;
}

/**
 * Project the LATEST non-superseded assessment for an admission into the six
 * cached_patients maternal_screen_* summary columns; clears them to NULL when
 * no assessment exists. Runs on whatever adapter it is given (plain or tx) —
 * callers own transactionality. This is THE single projection rule: both
 * saveMaternalScreenAssessment and reconcileLatestSummary use it, which is
 * what makes the summary reconstructable from history (AC #12).
 */
async function projectLatestSummary(
  adapter: DatabaseAdapter,
  laborAdmissionId: string,
): Promise<ReconcileSummaryResult> {
  // "Latest non-superseded": rows referenced by another row's supersedes_id
  // are corrected-away and excluded. Tie-breaks (same assessed_at AND same
  // created_at millisecond): a correcting row beats a non-correcting one,
  // then id keeps the ordering deterministic.
  const rows = await adapter.query<LatestAssessmentRow>(
    `SELECT a.id, a.local_tier, a.emergency_acuity, a.is_complete,
            a.suspected_conditions_json, a.assessed_at, a.rule_set_version
       FROM maternal_screening_assessments a
      WHERE a.labor_admission_id = ?
        AND NOT EXISTS (
          SELECT 1 FROM maternal_screening_assessments c WHERE c.supersedes_id = a.id
        )
      ORDER BY a.assessed_at DESC, a.created_at DESC,
               (a.supersedes_id IS NOT NULL) DESC, a.id DESC
      LIMIT 1`,
    [laborAdmissionId],
  );
  const now = new Date().toISOString();

  if (rows.length === 0) {
    await adapter.execute(
      `UPDATE cached_patients SET
         maternal_screen_local_tier = NULL,
         maternal_screen_emergency_acuity = NULL,
         maternal_screen_condition_codes = NULL,
         maternal_screen_assessed_at = NULL,
         maternal_screen_is_complete = NULL,
         maternal_screen_rule_set_version = NULL,
         updated_at = ?
       WHERE id = ?`,
      [now, laborAdmissionId],
    );
    return { status: 'cleared', assessmentId: null };
  }

  const latest = rows[0];
  // pg/PGlite return JSONB pre-parsed; a string means a non-JSONB dialect.
  const rawConditions = latest.suspected_conditions_json;
  const conditions: string[] =
    typeof rawConditions === 'string'
      ? (JSON.parse(rawConditions) as string[])
      : ((rawConditions as string[] | null) ?? []);
  const assessedAtIso =
    latest.assessed_at instanceof Date ? latest.assessed_at.toISOString() : latest.assessed_at;

  await adapter.execute(
    `UPDATE cached_patients SET
       maternal_screen_local_tier = ?,
       maternal_screen_emergency_acuity = ?,
       maternal_screen_condition_codes = ?,
       maternal_screen_assessed_at = ?,
       maternal_screen_is_complete = ?,
       maternal_screen_rule_set_version = ?,
       updated_at = ?
     WHERE id = ?`,
    [
      fitOrNull(latest.local_tier, WIDTHS.localTier, 'maternal_screen_local_tier'),
      fitOrNull(latest.emergency_acuity, WIDTHS.emergencyAcuity, 'maternal_screen_emergency_acuity'),
      // Comma-separated dashboard projection — the assessment row's
      // suspected_conditions_json stays the structured source of truth.
      conditions.length > 0
        ? fitOrNull(conditions.join(','), WIDTHS.conditionCodes, 'maternal_screen_condition_codes')
        : null,
      assessedAtIso,
      latest.is_complete,
      fitOrNull(latest.rule_set_version, WIDTHS.ruleSetVersion, 'maternal_screen_rule_set_version'),
      now,
      laborAdmissionId,
    ],
  );
  return { status: 'reconciled', assessmentId: latest.id };
}

/**
 * Rebuild the cached_patients maternal_screen_* summary from the latest
 * non-superseded assessment for the admission (AC #12: the projection is
 * always reconstructable from the immutable history). Clears the summary to
 * NULL when the admission has no assessments.
 */
export async function reconcileLatestSummary(
  db: DatabaseAdapter,
  laborAdmissionId: string,
): Promise<ReconcileSummaryResult> {
  return db.transaction(async (tx) => {
    const admission = await tx.query<{ id: string }>(
      `SELECT id FROM cached_patients WHERE id = ?`,
      [laborAdmissionId],
    );
    if (admission.length === 0) {
      throw new MaternalScreenStoreError(
        `labor admission ${laborAdmissionId} not found — cannot reconcile a summary for a missing cached_patients row`,
        'ADMISSION_NOT_FOUND',
      );
    }
    return projectLatestSummary(tx, laborAdmissionId);
  });
}
