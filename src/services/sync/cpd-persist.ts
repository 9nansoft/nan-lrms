// CPD score persistence — reads cached_patients, calls pure calculateCpdScore, writes cpd_scores
// Shared by polling pipeline and webhook pipeline (Constitution IV: centralized business logic)
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import type { SseManager } from '@/lib/sse';
import { calculateCpdScore } from '@/services/cpd-score';
import { RiskLevel } from '@/types/domain';
import { CooperativeYielder } from '@/lib/event-loop';
import { logger } from '@/lib/logger';
import { enqueueCpdHighAlert } from '@/services/risk-alert';
import {
  resolveAlertOrigin,
  decryptPatientName,
  type AlertOrigin,
} from '@/services/alert-context';

export async function calculateAndStoreCpdScores(
  db: DatabaseAdapter,
  hospitalId: string,
  sseManager: SseManager,
): Promise<void> {
  const patients = await db.query<{
    id: string;
    an: string;
    // Encrypted at rest (PDPA). Widening this existing SELECT rather than
    // adding a per-patient lookup: this loop runs for every ACTIVE patient on
    // every sync tick and is on the page-latency critical path (hence the
    // CooperativeYielder below).
    name: string | null;
    gravida: number | null;
    anc_count: number | null;
    ga_weeks: number | null;
    height_cm: number | null;
    weight_diff_kg: number | null;
    fundal_height_cm: number | null;
    us_weight_g: number | null;
    hematocrit_pct: number | null;
  }>(
    "SELECT id, an, name, gravida, anc_count, ga_weeks, height_cm, weight_diff_kg, fundal_height_cm, us_weight_g, hematocrit_pct FROM cached_patients WHERE hospital_id = ? AND labor_status = 'ACTIVE'",
    [hospitalId],
  );

  const hospitalRows = await db.query<{ hcode: string }>(
    'SELECT hcode FROM hospitals WHERE id = ?',
    [hospitalId],
  );
  const hcode = hospitalRows[0]?.hcode ?? '';

  // Resolved lazily on the first HIGH transition and memoized for the run: most
  // ticks produce none, and this loop must not pay an extra query per tick for
  // an alert that will not fire.
  let alertOrigin: AlertOrigin | null = null;

  // Bounded cooperative yielding (page-stall fix part 2): this recomputes CPD
  // for EVERY ACTIVE patient of the hospital on each webhook/browser-push
  // cycle — tick per patient so the pure-CPU scoring never monopolizes the
  // serving event loop. No transaction is held here (per-patient INSERTs).
  const yielder = new CooperativeYielder();
  for (const p of patients) {
    await yielder.tick();
    const factors: Record<string, number> = {};
    if (p.gravida != null) factors.gravida = p.gravida;
    if (p.anc_count != null) factors.ancCount = p.anc_count;
    if (p.ga_weeks != null) factors.gaWeeks = p.ga_weeks;
    if (p.height_cm != null) factors.heightCm = p.height_cm;
    if (p.weight_diff_kg != null) factors.weightDiffKg = p.weight_diff_kg;
    if (p.fundal_height_cm != null) factors.fundalHeightCm = p.fundal_height_cm;
    if (p.us_weight_g != null) factors.usWeightG = p.us_weight_g;
    if (p.hematocrit_pct != null) factors.hematocritPct = p.hematocrit_pct;

    const result = calculateCpdScore(factors);
    const now = new Date().toISOString();

    const prevScores = await db.query<{ risk_level: string }>(
      'SELECT risk_level FROM cpd_scores WHERE patient_id = ? ORDER BY calculated_at DESC LIMIT 1',
      [p.id],
    );
    const prevRiskLevel = prevScores[0]?.risk_level ?? null;

    await db.execute(
      `INSERT INTO cpd_scores (
        id, patient_id, score, risk_level, recommendation,
        factor_gravida, factor_anc_count, factor_ga_weeks, factor_height_cm,
        factor_weight_diff, factor_fundal_ht, factor_us_weight, factor_hematocrit,
        missing_factors, calculated_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(), p.id, result.score, result.riskLevel, result.recommendation,
        result.factorScores.gravida ?? null,
        result.factorScores.ancCount ?? null,
        result.factorScores.gaWeeks ?? null,
        result.factorScores.heightCm ?? null,
        result.factorScores.weightDiffKg ?? null,
        result.factorScores.fundalHeightCm ?? null,
        result.factorScores.usWeightG ?? null,
        result.factorScores.hematocritPct ?? null,
        JSON.stringify(result.missingFactors),
        now, now,
      ],
    );

    if (prevRiskLevel && prevRiskLevel !== result.riskLevel) {
      sseManager.broadcast('patient-update', {
        type: 'risk_changed',
        hcode,
        an: p.an,
        riskLevel: result.riskLevel,
        previousRiskLevel: prevRiskLevel,
        score: result.score,
      });
    }

    // NOTE: prevRiskLevel is null on a patient's FIRST score, so this gate also
    // fires for someone who arrives already HIGH. That is intentional, not a
    // bug to "fix" — a newly admitted high-risk patient is precisely the case
    // the ward needs told about. The threshold itself is never restated here:
    // result.riskLevel comes from classifyRiskLevel, which reads
    // RISK_LEVELS[HIGH].minScore.
    if (result.riskLevel === RiskLevel.HIGH && prevRiskLevel !== RiskLevel.HIGH) {
      sseManager.broadcast('patient-update', {
        type: 'high_risk_alert',
        hcode,
        an: p.an,
        score: result.score,
        recommendation: result.recommendation,
      });

      // MOPH Prompt cpd_high producer. Shared service site: the webhook
      // pipeline and /api/sync/browser-push both reach it here, so there is no
      // second call site on either route. Best-effort — a failure must never
      // abort the sync run or lose the score that was just written.
      try {
        alertOrigin ??= await resolveAlertOrigin(db, hospitalId, hcode);
        await enqueueCpdHighAlert(db, {
          hospitalId,
          originHcode: hcode,
          hospitalName: alertOrigin.hospitalName,
          province: alertOrigin.province,
          // PDPA: the AN, never the CID — caseRef is rendered into the message.
          caseRef: `CPD-AN-${p.an}`,
          localDate: alertOrigin.localDate,
          patientName: decryptPatientName(p.name),
          confirmUrl: null,
        });
      } catch (e) {
        logger.warn('moph_alert_cpd_high_enqueue_failed', { hospitalId, an: p.an, error: e });
      }
    }
  }
}
