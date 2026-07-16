// Task 6 (maternal labor-triage screening) — transactional store integration
// tests on the shared PGlite harness. Proves the GC6 persistence contract:
// atomic assessment-row + summary write, idempotent replay, immutable
// correction chain, rollback-on-failure (never a fallback row), tenant
// isolation, and a summary projection reconstructable from history (AC #12).
// Assertions compare persisted values against the ENGINE'S OWN result for the
// same input — the store must never diverge from evaluateMaternalScreen (GC2).
import { describe, it, expect, beforeEach } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../helpers/testDb';
import { FailingAdapter } from '../helpers/failingDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { evaluateMaternalScreen } from '@/services/maternal-screening';
import {
  saveMaternalScreenAssessment,
  reconcileLatestSummary,
  MaternalScreenStoreError,
  type SaveMaternalScreenParams,
} from '@/services/maternal-screening-store';
import type { MaternalScreenInput } from '@/types/maternal-screening';

const EVALUATED_AT = '2026-07-16T08:00:00.000Z';
const ASSESSED_AT = '2026-07-16T07:55:00.000Z';

// Fully-unassessed baseline (same convention as the Task 3/4 test files):
// every nullable field null, every categorical discriminant 'UNKNOWN'.
const baseInput: MaternalScreenInput = {
  gaWeeks: null,
  gaDays: null,
  piHDiagnosed: null,
  systolicBp: null,
  diastolicBp: null,
  proteinuriaGrade: 'UNKNOWN',
  creatinineMgDl: null,
  creatinineBaselineMgDl: null,
  plateletPerUl: null,
  astIuL: null,
  altIuL: null,
  urineOutputMlPerHour: null,
  headache: 'UNKNOWN',
  blurredVision: null,
  epigastricPain: null,
  pulmonaryEdema: null,
  rightUpperQuadrantPain: null,
  vaginalBleeding: null,
  estimatedBleedingMl: null,
  bleedingRate: 'UNKNOWN',
  concealedBleedingSuspected: null,
  abdominalOrBackPain: null,
  uterineTenderness: null,
  frequentContractions: null,
  contractionDurationExceedsInterval: null,
  suprapubicTenderness: null,
  bandlsRing: null,
  membranesRuptured: null,
  abnormalPresentation: null,
  fetalHeartRateBpm: null,
  fetalTracingPattern: 'UNKNOWN',
  maternalPulseBpm: null,
  respiratoryRatePerMin: null,
  oxygenSaturationPct: null,
  consciousness: 'UNKNOWN',
  shockSignsPresent: null,
  placentaPreviaExcluded: null,
  placentaLocationSource: 'UNKNOWN',
};

function makeInput(partial: Partial<MaternalScreenInput>): MaternalScreenInput {
  return { ...baseInput, ...partial };
}

/** Severe-preeclampsia-pattern input with EVERY mandatory field assessed. */
const SEVERE_COMPLETE_INPUT = makeInput({
  gaWeeks: 34,
  gaDays: 2,
  systolicBp: 165,
  diastolicBp: 112,
  proteinuriaGrade: 'TWO_PLUS',
  headache: 'SEVERE',
  vaginalBleeding: false,
  fetalHeartRateBpm: 140,
  maternalPulseBpm: 88,
  consciousness: 'ALERT',
  shockSignsPresent: false,
});

/** Mild-pattern input with every mandatory field assessed (correction target). */
const MILD_COMPLETE_INPUT = makeInput({
  gaWeeks: 34,
  gaDays: 2,
  systolicBp: 142,
  diastolicBp: 80,
  proteinuriaGrade: 'NEGATIVE',
  headache: 'NONE',
  vaginalBleeding: false,
  fetalHeartRateBpm: 140,
  maternalPulseBpm: 88,
  consciousness: 'ALERT',
  shockSignsPresent: false,
});

async function seedHospital(db: DatabaseAdapter): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, String(Math.floor(10000 + Math.random() * 89999)), 'Test Hospital', 'A', true, now, now],
  );
  return id;
}

let anCounter = 0;
async function seedCachedPatient(db: DatabaseAdapter, hospitalId: string): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  anCounter += 1;
  await db.execute(
    `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, hospitalId, `HN${anCounter}`, `AN${anCounter}`, 'enc-name', 28, now, now, now, now],
  );
  return id;
}

function saveParams(
  hospitalId: string,
  laborAdmissionId: string,
  overrides: Partial<SaveMaternalScreenParams> = {},
): SaveMaternalScreenParams {
  return {
    hospitalId,
    laborAdmissionId,
    sourceSystem: 'WEBHOOK',
    sourcePk: null,
    assessedAt: ASSESSED_AT,
    assessedBy: 'nurse-001',
    input: SEVERE_COMPLETE_INPUT,
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

interface AssessmentRow {
  id: string;
  labor_admission_id: string;
  hospital_id: string;
  journey_id: string | null;
  source_system: string;
  source_pk: string | null;
  assessed_at: string | Date;
  assessed_by: string | null;
  input_json: unknown;
  local_tier: string;
  emergency_acuity: string;
  is_complete: boolean;
  suspected_conditions_json: unknown;
  matches_json: unknown;
  missing_fields_json: unknown;
  rule_set_version: string;
  supersedes_id: string | null;
  created_at: string | Date;
}

async function readAssessments(db: DatabaseAdapter, laborAdmissionId: string) {
  return db.query<AssessmentRow>(
    `SELECT * FROM maternal_screening_assessments
      WHERE labor_admission_id = ? ORDER BY created_at, id`,
    [laborAdmissionId],
  );
}

interface SummaryRow {
  maternal_screen_local_tier: string | null;
  maternal_screen_emergency_acuity: string | null;
  maternal_screen_condition_codes: string | null;
  maternal_screen_assessed_at: string | Date | null;
  maternal_screen_is_complete: boolean | null;
  maternal_screen_rule_set_version: string | null;
}

async function readSummary(db: DatabaseAdapter, patientId: string): Promise<SummaryRow> {
  const rows = await db.query<SummaryRow>(
    `SELECT maternal_screen_local_tier, maternal_screen_emergency_acuity,
            maternal_screen_condition_codes, maternal_screen_assessed_at,
            maternal_screen_is_complete, maternal_screen_rule_set_version
       FROM cached_patients WHERE id = ?`,
    [patientId],
  );
  expect(rows).toHaveLength(1);
  return rows[0];
}

function toIso(value: string | Date | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

// pg/PGlite return JSONB pre-parsed; normalize in case of a string dialect.
function asJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

describe('saveMaternalScreenAssessment (Task 6 transactional store)', () => {
  let db: DatabaseAdapter;
  let hospitalId: string;
  let patientId: string;

  beforeEach(async () => {
    db = await createTestDb();
    hospitalId = await seedHospital(db);
    patientId = await seedCachedPatient(db, hospitalId);
  });

  it('inserts the immutable assessment row AND the six summary columns, matching the engine result', async () => {
    const engine = evaluateMaternalScreen(SEVERE_COMPLETE_INPUT, EVALUATED_AT);
    const result = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'msa-1' }),
    );

    // Structured, PHI-free result mirrors the server-side evaluation (GC2).
    expect(result.status).toBe('created');
    expect(result.localTier).toBe(engine.localTier);
    expect(result.emergencyAcuity).toBe(engine.emergencyAcuity);
    expect(result.isComplete).toBe(engine.isComplete);
    expect(result.ruleSetVersion).toBe(engine.ruleSetVersion);
    // Sanity: this input is a proven severe pattern with all mandatory fields.
    expect(engine.localTier).toBe('LOCAL_SEVERE');
    expect(engine.isComplete).toBe(true);

    const rows = await readAssessments(db, patientId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.id).toBe(result.assessmentId);
    expect(row.hospital_id).toBe(hospitalId);
    expect(row.journey_id).toBeNull();
    expect(row.source_system).toBe('WEBHOOK');
    expect(row.source_pk).toBe('msa-1');
    expect(toIso(row.assessed_at)).toBe(ASSESSED_AT);
    expect(row.assessed_by).toBe('nurse-001');
    expect(asJson(row.input_json)).toEqual(SEVERE_COMPLETE_INPUT); // immutable snapshot
    expect(row.local_tier).toBe(engine.localTier);
    expect(row.emergency_acuity).toBe(engine.emergencyAcuity);
    expect(row.is_complete).toBe(engine.isComplete);
    expect(asJson(row.suspected_conditions_json)).toEqual(engine.suspectedConditions);
    expect(asJson(row.matches_json)).toEqual(JSON.parse(JSON.stringify(engine.matches)));
    expect(asJson(row.missing_fields_json)).toEqual(engine.missingRequiredFields);
    expect(row.rule_set_version).toBe(engine.ruleSetVersion);
    expect(row.supersedes_id).toBeNull();

    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBe(engine.localTier);
    expect(summary.maternal_screen_emergency_acuity).toBe(engine.emergencyAcuity);
    expect(summary.maternal_screen_condition_codes).toBe(
      engine.suspectedConditions.length > 0 ? engine.suspectedConditions.join(',') : null,
    );
    expect(toIso(summary.maternal_screen_assessed_at)).toBe(ASSESSED_AT);
    expect(summary.maternal_screen_is_complete).toBe(engine.isComplete);
    expect(summary.maternal_screen_rule_set_version).toBe(engine.ruleSetVersion);
  });

  it('is idempotent: replaying the same (hospitalId, sourceSystem, sourcePk) leaves ONE row and an unchanged summary', async () => {
    const first = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'replay-1', input: SEVERE_COMPLETE_INPUT }),
    );
    const summaryBefore = await readSummary(db, patientId);

    // Replay with a DIFFERENT input — same idempotency key wins: content
    // changes require an explicit correction, never a silent overwrite (GC6).
    const replay = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'replay-1', input: MILD_COMPLETE_INPUT }),
    );

    expect(replay.status).toBe('duplicate');
    expect(replay.assessmentId).toBe(first.assessmentId);
    expect(replay.localTier).toBe(first.localTier); // stored values, not the replay's

    const rows = await readAssessments(db, patientId);
    expect(rows).toHaveLength(1);
    expect(await readSummary(db, patientId)).toEqual(summaryBefore);
  });

  it('correction inserts a NEW row with supersedes_id, never mutates the original, and the summary follows the correction', async () => {
    const original = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'corr-orig', input: SEVERE_COMPLETE_INPUT }),
    );
    const originalRowBefore = (await readAssessments(db, patientId))[0];

    const correctionEngine = evaluateMaternalScreen(MILD_COMPLETE_INPUT, EVALUATED_AT);
    const correction = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, {
        sourcePk: 'corr-fix',
        input: MILD_COMPLETE_INPUT,
        supersedesId: original.assessmentId,
      }),
    );
    expect(correction.status).toBe('corrected');
    expect(correction.assessmentId).not.toBe(original.assessmentId);

    const rows = await readAssessments(db, patientId);
    expect(rows).toHaveLength(2);
    const originalRowAfter = rows.find((r) => r.id === original.assessmentId);
    const correctionRow = rows.find((r) => r.id === correction.assessmentId);

    // The original row is byte-for-byte untouched (GC6: append-only).
    expect(originalRowAfter).toEqual(originalRowBefore);
    expect(originalRowAfter?.supersedes_id).toBeNull();
    expect(correctionRow?.supersedes_id).toBe(original.assessmentId);

    // Summary now reflects the correcting (latest non-superseded) row.
    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBe(correctionEngine.localTier);
    expect(summary.maternal_screen_emergency_acuity).toBe(correctionEngine.emergencyAcuity);
    expect(summary.maternal_screen_is_complete).toBe(correctionEngine.isComplete);
    expect(correctionEngine.localTier).toBe('LOCAL_MILD'); // sanity: it actually changed
  });

  it('rejects a correction whose target belongs to a different admission, persisting nothing', async () => {
    const otherPatientId = await seedCachedPatient(db, hospitalId);
    const other = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, otherPatientId, { sourcePk: 'other-admission' }),
    );

    await expect(
      saveMaternalScreenAssessment(
        db,
        saveParams(hospitalId, patientId, {
          sourcePk: 'bad-corr',
          supersedesId: other.assessmentId,
        }),
      ),
    ).rejects.toThrow(MaternalScreenStoreError);

    expect(await readAssessments(db, patientId)).toHaveLength(0);
    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBeNull();
  });

  it('rolls back when evaluation throws: zero rows, summary untouched — never a fallback result (spec §8.3)', async () => {
    const poisoned = new Proxy({} as Record<string, never>, {
      get() {
        throw new Error('synthetic evaluation crash');
      },
    }) as unknown as MaternalScreenInput;

    await expect(
      saveMaternalScreenAssessment(
        db,
        saveParams(hospitalId, patientId, { sourcePk: 'eval-boom', input: poisoned }),
      ),
    ).rejects.toThrow(/evaluation failed/);

    expect(await readAssessments(db, patientId)).toHaveLength(0);
    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBeNull(); // no fallback NO_LOCAL_MATCH
    expect(summary.maternal_screen_emergency_acuity).toBeNull(); // no fallback STABLE
    expect(summary.maternal_screen_is_complete).toBeNull();
  });

  it('rolls back the assessment INSERT when the summary UPDATE fails mid-transaction (failingDb)', async () => {
    const failing = new FailingAdapter(db, /UPDATE cached_patients/);

    await expect(
      saveMaternalScreenAssessment(
        failing,
        saveParams(hospitalId, patientId, { sourcePk: 'midtx-boom' }),
      ),
    ).rejects.toThrow(MaternalScreenStoreError);

    // The INSERT ran before the injected failure — the ROLLBACK must undo it.
    expect(await readAssessments(db, patientId)).toHaveLength(0);
    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBeNull();
  });

  it('isolates tenants: hospital A cannot write to hospital B admissions, and B is untouched by A saves', async () => {
    const hospitalB = await seedHospital(db);
    const patientB = await seedCachedPatient(db, hospitalB);

    // A's save succeeds and leaves B's patient summary untouched.
    await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'tenant-a' }),
    );
    const summaryB = await readSummary(db, patientB);
    expect(summaryB.maternal_screen_local_tier).toBeNull();
    expect(await readAssessments(db, patientB)).toHaveLength(0);

    // Hospital B claiming A's admission id is rejected; nothing persisted.
    await expect(
      saveMaternalScreenAssessment(
        db,
        saveParams(hospitalB, patientId, { sourcePk: 'tenant-cross' }),
      ),
    ).rejects.toThrow(/not found for hospital/);
    expect(await readAssessments(db, patientId)).toHaveLength(1); // only A's row

    // The idempotency key is scoped per hospital: the SAME source_pk in B's
    // own tenancy still inserts (no cross-tenant duplicate collapse).
    const b = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalB, patientB, { sourcePk: 'tenant-a' }),
    );
    expect(b.status).toBe('created');
  });

  it('persists a proven LOCAL_SEVERE with is_complete:false — severity coexists with incompleteness (GC1)', async () => {
    // HELLP-pattern platelets alone: severe, but many mandatory fields unassessed.
    const input = makeInput({ plateletPerUl: 50000 });
    const engine = evaluateMaternalScreen(input, EVALUATED_AT);
    expect(engine.localTier).toBe('LOCAL_SEVERE');
    expect(engine.isComplete).toBe(false);

    await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'gc1-severe-incomplete', input }),
    );

    const [row] = await readAssessments(db, patientId);
    expect(row.local_tier).toBe('LOCAL_SEVERE');
    expect(row.is_complete).toBe(false);
    expect(asJson(row.missing_fields_json)).toEqual(engine.missingRequiredFields);

    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBe('LOCAL_SEVERE');
    expect(summary.maternal_screen_is_complete).toBe(false);
  });
});

describe('reconcileLatestSummary (AC #12: summary reconstructable from history)', () => {
  let db: DatabaseAdapter;
  let hospitalId: string;
  let patientId: string;

  beforeEach(async () => {
    db = await createTestDb();
    hospitalId = await seedHospital(db);
    patientId = await seedCachedPatient(db, hospitalId);
  });

  async function clobberSummary(): Promise<void> {
    await db.execute(
      `UPDATE cached_patients SET
         maternal_screen_local_tier = 'NO_LOCAL_MATCH',
         maternal_screen_emergency_acuity = 'STABLE',
         maternal_screen_condition_codes = 'JUNK',
         maternal_screen_assessed_at = ?,
         maternal_screen_is_complete = true,
         maternal_screen_rule_set_version = 'junk-version'
       WHERE id = ?`,
      ['2020-01-01T00:00:00.000Z', patientId],
    );
  }

  it('rebuilds the summary from the latest non-superseded assessment after external corruption', async () => {
    const original = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, { sourcePk: 'rec-orig', input: SEVERE_COMPLETE_INPUT }),
    );
    const correction = await saveMaternalScreenAssessment(
      db,
      saveParams(hospitalId, patientId, {
        sourcePk: 'rec-fix',
        input: MILD_COMPLETE_INPUT,
        supersedesId: original.assessmentId,
      }),
    );
    await clobberSummary();

    const result = await reconcileLatestSummary(db, patientId);
    expect(result.status).toBe('reconciled');
    expect(result.assessmentId).toBe(correction.assessmentId); // not the superseded original

    const engine = evaluateMaternalScreen(MILD_COMPLETE_INPUT, EVALUATED_AT);
    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBe(engine.localTier);
    expect(summary.maternal_screen_emergency_acuity).toBe(engine.emergencyAcuity);
    expect(summary.maternal_screen_condition_codes).toBe(
      engine.suspectedConditions.length > 0 ? engine.suspectedConditions.join(',') : null,
    );
    expect(toIso(summary.maternal_screen_assessed_at)).toBe(ASSESSED_AT);
    expect(summary.maternal_screen_is_complete).toBe(engine.isComplete);
    expect(summary.maternal_screen_rule_set_version).toBe(engine.ruleSetVersion);
  });

  it('clears all six summary columns when the admission has no assessments', async () => {
    await clobberSummary();

    const result = await reconcileLatestSummary(db, patientId);
    expect(result.status).toBe('cleared');
    expect(result.assessmentId).toBeNull();

    const summary = await readSummary(db, patientId);
    expect(summary.maternal_screen_local_tier).toBeNull();
    expect(summary.maternal_screen_emergency_acuity).toBeNull();
    expect(summary.maternal_screen_condition_codes).toBeNull();
    expect(summary.maternal_screen_assessed_at).toBeNull();
    expect(summary.maternal_screen_is_complete).toBeNull();
    expect(summary.maternal_screen_rule_set_version).toBeNull();
  });

  it('raises an actionable operational error for a missing admission', async () => {
    await expect(reconcileLatestSummary(db, uuidv4())).rejects.toThrow(/not found/);
  });
});
