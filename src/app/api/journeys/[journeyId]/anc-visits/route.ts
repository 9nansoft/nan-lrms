import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import type { AncVisitEntry } from '@/types/api';

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

function parseJson<T = unknown>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) as T; } catch { return null; }
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

    const rows = await db.query<Record<string, unknown>>(
      `SELECT cv.*, vh.name AS visit_hospital_name, vh.hcode AS visit_hcode
         FROM cached_anc_visits cv
         LEFT JOIN hospitals vh ON vh.id = cv.hospital_id
        WHERE cv.journey_id = ?
        ORDER BY cv.visit_date, cv.visit_number`,
      [journeyId],
    );

    const visits: AncVisitEntry[] = rows.map((v) => ({
      visitDate: v.visit_date as string,
      visitNumber: v.visit_number as number,
      hospitalName: (v.visit_hospital_name as string | null) ?? null,
      hcode: (v.visit_hcode as string | null) ?? null,
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
      vaccinesGiven: parseJson<AncVisitEntry['vaccinesGiven']>(v.vaccines_given_json) ?? null,
      urineKetone: (v.urine_ketone as string | null) ?? null,
      urineCultureResult: (v.urine_culture_result as string | null) ?? null,
      iodineGiven: v.iodine_given == null ? null : !!v.iodine_given,
      multivitaminGiven: v.multivitamin_given == null ? null : !!v.multivitamin_given,
      vitaminDIu: (v.vitamin_d_iu as number | null) ?? null,
      nstResult: (v.nst_result as AncVisitEntry['nstResult']) ?? null,
      bppScore: (v.bpp_score as number | null) ?? null,
      umbilicalDopplerResult:
        (v.umbilical_doppler_result as AncVisitEntry['umbilicalDopplerResult']) ?? null,
      psychosocialScreen: parseJson<AncVisitEntry['psychosocialScreen']>(
        v.psychosocial_screen_json,
      ) ?? null,
    }));

    return NextResponse.json({ visits });
  } catch (error) {
    logger.error('anc_visits_api_failed', { error });
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        : `เกิดข้อผิดพลาด: ${detail}`;
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message, details: null } },
      { status: 500 },
    );
  }
}
