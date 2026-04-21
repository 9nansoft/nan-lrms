import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { decryptSafe } from '@/lib/encryption';
import type { JourneyDetailResponse, AncVisitEntry, AncRiskEntry, ReferralListItem, NewbornEntry } from '@/types/api';

// Tolerant parser — HOSxP / webhook may store this as a JSON string (Postgres)
// or already-deserialized array (SQLite json column). Returns null on garbage.
function parseDangerSigns(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : null;
    } catch { return null; }
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ journeyId: string }> },
) {
  try {
    await ensureInit();
    const { journeyId } = await params;
    const db = await getDatabase();

    // Get journey with hospital info + latest known maternal height (labor-side,
    // if this journey has crossed over to a cached_patients record).
    const journeyRows = await db.query<Record<string, unknown>>(
      `SELECT mj.*, h.name as hospital_name, h.hcode,
              ch.name as current_hospital_name, ch.hcode as current_hcode,
              (SELECT cp.height_cm FROM cached_patients cp
                 WHERE cp.journey_id = mj.id AND cp.height_cm IS NOT NULL
                 ORDER BY cp.updated_at DESC LIMIT 1) as height_cm
       FROM maternal_journeys mj
       JOIN hospitals h ON h.id = mj.hospital_id
       JOIN hospitals ch ON ch.id = mj.current_hospital_id
       WHERE mj.id = ?`,
      [journeyId],
    );

    if (journeyRows.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลการตั้งครรภ์', details: null } },
        { status: 404 },
      );
    }

    const r = journeyRows[0];

    // Get ANC visits
    const visitRows = await db.query<Record<string, unknown>>(
      `SELECT * FROM cached_anc_visits WHERE journey_id = ? ORDER BY visit_date`,
      [journeyId],
    );
    const ancVisits: AncVisitEntry[] = visitRows.map((v) => ({
      visitDate: v.visit_date as string,
      visitNumber: v.visit_number as number,
      gaWeeks: v.ga_weeks as number | null,
      fundalHeightCm: v.fundal_height_cm as number | null,
      weightKg: v.weight_kg as number | null,
      bpSystolic: v.bp_systolic as number | null,
      bpDiastolic: v.bp_diastolic as number | null,
      fetalHr: v.fetal_hr as number | null,
      presentation: (v.presentation as string | null) ?? null,
      engagement: (v.engagement as string | null) ?? null,
      passQuality: v.pass_quality == null ? null : !!v.pass_quality,
      urineProtein: (v.urine_protein as string | null) ?? null,
      urineGlucose: (v.urine_glucose as string | null) ?? null,
      hbGDl: v.hb_g_dl == null ? null : Number(v.hb_g_dl),
      hctPct: v.hct_pct == null ? null : Number(v.hct_pct),
      ttDoseNo: v.tt_dose_no as number | null,
      ironFolicGiven: v.iron_folic_given == null ? null : !!v.iron_folic_given,
      calciumGiven: v.calcium_given == null ? null : !!v.calcium_given,
      dangerSigns: parseDangerSigns(v.danger_signs_json),
      fetalMovementOk: v.fetal_movement_ok == null ? null : !!v.fetal_movement_ok,
    }));

    // Get latest risk
    const riskRows = await db.query<Record<string, unknown>>(
      `SELECT * FROM cached_anc_risks WHERE journey_id = ? ORDER BY screened_at DESC LIMIT 1`,
      [journeyId],
    );
    const latestRisk: AncRiskEntry | null = riskRows.length > 0 ? {
      riskLevel: riskRows[0].risk_level as string,
      triggeredRules: JSON.parse(riskRows[0].triggered_rules as string || '[]'),
      screenedAt: riskRows[0].screened_at as string,
      recommendedFacility: riskRows[0].recommended_facility as string | null,
    } : null;

    // Get referrals with hospital names
    const refRows = await db.query<Record<string, unknown>>(
      `SELECT cr.*, fh.name as from_name, th.name as to_name
       FROM cached_referrals cr
       JOIN hospitals fh ON fh.id = cr.from_hospital_id
       JOIN hospitals th ON th.id = cr.to_hospital_id
       WHERE cr.journey_id = ?
       ORDER BY cr.initiated_at DESC`,
      [journeyId],
    );
    const referrals: ReferralListItem[] = refRows.map((ref) => ({
      id: ref.id as string,
      fromHospital: ref.from_name as string,
      toHospital: ref.to_name as string,
      status: ref.status as string,
      reason: ref.reason as string,
      urgencyLevel: ref.urgency_level as string,
      initiatedAt: ref.initiated_at as string,
      arrivedAt: ref.arrived_at as string | null,
    }));

    // Get newborns
    const nbRows = await db.query<Record<string, unknown>>(
      `SELECT * FROM cached_newborns WHERE journey_id = ? ORDER BY infant_number`,
      [journeyId],
    );
    const newborns: NewbornEntry[] = nbRows.map((nb) => ({
      infantNumber: nb.infant_number as number,
      sex: nb.sex as string | null,
      birthWeightG: nb.birth_weight_g as number | null,
      apgar1min: nb.apgar_1min as number | null,
      apgar5min: nb.apgar_5min as number | null,
      bornAt: nb.born_at as string,
    }));

    const response: JourneyDetailResponse = {
      journey: {
        id: r.id as string,
        hn: r.hn as string,
        name: decryptSafe(r.name as string),
        age: r.age as number,
        gravida: r.gravida as number,
        para: r.para as number,
        gaWeeks: r.ga_weeks as number | null,
        lmp: r.lmp as string | null,
        edc: r.edc as string | null,
        careStage: r.care_stage as string,
        ancRiskLevel: r.anc_risk_level as string,
        ancVisitCount: r.anc_visit_count as number,
        lastAncDate: r.last_anc_date as string | null,
        hospitalName: r.hospital_name as string,
        hcode: r.hcode as string,
        registeredAt: r.registered_at as string,
        currentHospitalName: r.current_hospital_name as string,
        currentHcode: r.current_hcode as string,
        heightCm: r.height_cm as number | null,
        bloodGroup: (r.blood_group as string | null) ?? null,
        rhFactor: (r.rh_factor as string | null) ?? null,
        hbsagResult: (r.hbsag_result as string | null) ?? null,
        vdrlResult: (r.vdrl_result as string | null) ?? null,
        hivResult: (r.hiv_result as string | null) ?? null,
        ogttResult: (r.ogtt_result as string | null) ?? null,
        termBirths: r.term_births as number | null,
        pretermBirths: r.preterm_births as number | null,
        abortions: r.abortions as number | null,
        livingChildren: r.living_children as number | null,
        pastMedicalHistory: (r.past_medical_history as string | null) ?? null,
      },
      ancVisits,
      latestRisk,
      referrals,
      newborns,
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('journey_detail_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
