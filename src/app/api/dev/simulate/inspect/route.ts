// GET /api/dev/simulate/inspect — dev-only. Dumps counts + small samples
// from every simulation-touched table so you can sanity-check what the
// Tier-1/2/3 pipeline is actually producing.
//
// Intentionally does NOT decrypt patient names — returns the encrypted blob
// as-is since this endpoint exists purely for developer debugging and we
// don't want plaintext PDPA data flowing over the wire.
import { NextResponse } from 'next/server';
import { simulationGuard } from '../_guard';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { simulationOrchestrator } from '@/services/dev-simulation/orchestrator';

// Run a query, return [] + log error text on failure. Makes the endpoint
// robust against running-server vs freshly-added-columns mismatches.
async function safeQuery<T>(
  db: Awaited<ReturnType<typeof getDatabase>>,
  sql: string,
  params: unknown[] = [],
  label: string,
  errors: Record<string, string>,
): Promise<T[]> {
  try {
    return (await db.query<T>(sql, params as never[])) as T[];
  } catch (e) {
    errors[label] = e instanceof Error ? e.message : String(e);
    return [];
  }
}

export async function GET() {
  const guard = simulationGuard();
  if (guard) return guard;

  try {
    return await handle();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack?.split('\n').slice(0, 8) : null },
      { status: 500 },
    );
  }
}

async function handle() {
  await ensureInit();
  const db = await getDatabase();
  const errors: Record<string, string> = {};

  const tables = [
    'maternal_journeys',
    'cached_anc_visits',
    'cached_anc_risks',
    'cached_patients',
    'cached_vital_signs',
    'cached_partograph_observations',
    'cached_referrals',
    'cached_newborns',
    'cpd_scores',
    'webhook_api_keys',
  ];

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const rows = await safeQuery<{ n: number }>(db, `SELECT COUNT(*) as n FROM ${t}`, [], `count:${t}`, errors);
    counts[t] = rows.length > 0 ? Number(rows[0].n ?? 0) : -1;
  }

  // Two journey queries — one with L2 columns, a stripped one as fallback.
  let sampleJourneys = await safeQuery<Record<string, unknown>>(db,
    `SELECT mj.id, mj.hn, mj.age, mj.gravida, mj.para, mj.ga_weeks, mj.lmp, mj.edc,
            mj.care_stage, mj.anc_risk_level, mj.anc_visit_count, mj.last_anc_date,
            mj.blood_group, mj.rh_factor, mj.hbsag_result, mj.vdrl_result,
            mj.hiv_result, mj.ogtt_result, mj.term_births, mj.preterm_births,
            mj.abortions, mj.living_children, mj.past_medical_history,
            h.hcode as registered_hcode, h.name as registered_hospital
     FROM maternal_journeys mj
     JOIN hospitals h ON h.id = mj.hospital_id
     ORDER BY mj.created_at DESC
     LIMIT 5`, [], 'sample:journeys', errors);
  if (sampleJourneys.length === 0 && errors['sample:journeys']) {
    sampleJourneys = await safeQuery<Record<string, unknown>>(db,
      `SELECT mj.id, mj.hn, mj.age, mj.gravida, mj.para, mj.ga_weeks, mj.lmp, mj.edc,
              mj.care_stage, mj.anc_risk_level, mj.anc_visit_count, mj.last_anc_date,
              h.hcode as registered_hcode, h.name as registered_hospital
       FROM maternal_journeys mj
       JOIN hospitals h ON h.id = mj.hospital_id
       ORDER BY mj.created_at DESC
       LIMIT 5`, [], 'sample:journeys:basic', errors);
  }

  let sampleAncVisits = await safeQuery<Record<string, unknown>>(db,
    `SELECT journey_id, visit_date, visit_number, ga_weeks, fundal_height_cm,
            weight_kg, bp_systolic, bp_diastolic, fetal_hr, presentation, engagement,
            urine_protein, urine_glucose, hb_g_dl, hct_pct, tt_dose_no,
            iron_folic_given, calcium_given, danger_signs_json, fetal_movement_ok
     FROM cached_anc_visits
     ORDER BY created_at DESC
     LIMIT 8`, [], 'sample:ancVisits', errors);
  if (sampleAncVisits.length === 0 && errors['sample:ancVisits']) {
    sampleAncVisits = await safeQuery<Record<string, unknown>>(db,
      `SELECT journey_id, visit_date, visit_number, ga_weeks, fundal_height_cm,
              weight_kg, bp_systolic, bp_diastolic, fetal_hr, presentation, engagement
       FROM cached_anc_visits ORDER BY created_at DESC LIMIT 8`,
      [], 'sample:ancVisits:basic', errors);
  }

  const sampleRisks = await safeQuery<Record<string, unknown>>(db,
    `SELECT journey_id, risk_level, triggered_rules, recommended_facility, screened_at
     FROM cached_anc_risks ORDER BY screened_at DESC LIMIT 5`, [], 'sample:risks', errors);

  const sampleLabor = await safeQuery<Record<string, unknown>>(db,
    `SELECT cp.hn, cp.an, cp.age, cp.gravida, cp.ga_weeks, cp.anc_count,
            cp.height_cm, cp.weight_kg, cp.fundal_height_cm, cp.us_weight_g,
            cp.hematocrit_pct, cp.labor_status, cp.admit_date,
            h.hcode, h.name as hospital_name
     FROM cached_patients cp
     JOIN hospitals h ON h.id = cp.hospital_id
     ORDER BY cp.created_at DESC LIMIT 5`, [], 'sample:labor', errors);

  const samplePartograph = await safeQuery<Record<string, unknown>>(db,
    `SELECT patient_id, hour_no, cervical_dilation_cm, fetal_heart_rate,
            bp_systolic, bp_diastolic, pulse, temperature,
            contraction_per_10min, contraction_duration_sec, contraction_strength,
            observe_datetime, note
     FROM cached_partograph_observations
     ORDER BY observe_datetime DESC LIMIT 5`, [], 'sample:partograph', errors);

  const sampleReferrals = await safeQuery<Record<string, unknown>>(db,
    `SELECT cr.refer_number, cr.status, cr.reason, cr.diagnosis_code,
            cr.urgency_level, cr.initiated_at,
            fh.hcode as from_hcode, th.hcode as to_hcode
     FROM cached_referrals cr
     JOIN hospitals fh ON fh.id = cr.from_hospital_id
     JOIN hospitals th ON th.id = cr.to_hospital_id
     ORDER BY cr.initiated_at DESC LIMIT 5`, [], 'sample:referrals', errors);

  const riskBreakdown = await safeQuery<{ anc_risk_level: string; n: number }>(db,
    `SELECT anc_risk_level, COUNT(*) as n FROM maternal_journeys GROUP BY anc_risk_level`,
    [], 'dist:risk', errors);

  const bloodGroupDist = await safeQuery<{ blood_group: string; n: number }>(db,
    `SELECT COALESCE(blood_group, '—') as blood_group, COUNT(*) as n
     FROM maternal_journeys GROUP BY blood_group`,
    [], 'dist:blood', errors);
  const rhDist = await safeQuery<{ rh_factor: string; n: number }>(db,
    `SELECT COALESCE(rh_factor, '—') as rh_factor, COUNT(*) as n
     FROM maternal_journeys GROUP BY rh_factor`,
    [], 'dist:rh', errors);

  // Parse triggered_rules JSON strings into arrays (pglite returns as string).
  const parseMaybeJson = (v: unknown): unknown => {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return v; }
    }
    return v;
  };
  const normalizedRisks = sampleRisks.map((r) => ({
    ...r,
    triggered_rules: parseMaybeJson(r.triggered_rules),
  }));
  const normalizedVisits = sampleAncVisits.map((v) => ({
    ...v,
    danger_signs_json: parseMaybeJson(v.danger_signs_json),
  }));

  return NextResponse.json({
    simStatus: simulationOrchestrator.status(),
    counts,
    riskBreakdown,
    bloodGroupDist,
    rhDist,
    samples: {
      journeys: sampleJourneys,
      ancVisits: normalizedVisits,
      risks: normalizedRisks,
      labor: sampleLabor,
      partograph: samplePartograph,
      referrals: sampleReferrals,
    },
    errors,
  });
}
