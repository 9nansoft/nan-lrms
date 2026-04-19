// T068 / T23: GET /api/patients/[an]/partogram
// Returns the WHO partogram view for a single labor admission. The handler
// hydrates `cached_partograph_observations`, runs CDSS analysis, and rolls up
// severity. Legacy `entries[]` is kept for the existing LaborProgressCard.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import {
  analyzePartograph,
  countBySeverity,
  generatePartogramEntries,
  highestSeverity,
} from '@/services/partogram';
import { logger } from '@/lib/logger';
import type {
  PartogramResponse,
  PartographObservationDto,
} from '@/types/api';

interface ObservationRow {
  id: string;
  observe_datetime: string;
  hour_no: number | null;
  fetal_heart_rate: number | null;
  amniotic_fluid: string | null;
  amniotic_type_name: string | null;
  moulding: string | null;
  cervical_dilation_cm: number | string | null;
  descent_of_head: string | null;
  contraction_per_10min: number | null;
  contraction_duration_sec: number | null;
  contraction_strength: string | null;
  oxytocin_uml: number | string | null;
  oxytocin_drops_min: number | null;
  drugs_iv_fluids: string | null;
  pulse: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature: number | string | null;
  urine_volume_ml: number | null;
  urine_protein: string | null;
  urine_glucose: string | null;
  urine_acetone: string | null;
  note: string | null;
  entry_staff: string | null;
  source_system: string;
}

function toNumber(v: number | string | null): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ an: string }> },
) {
  try {
    await ensureInit();
    const { an: patientId } = await params;
    const parsed = parsePatientId(patientId);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid patient ID format', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }
    const { hcode, an } = parsed;
    const db = await getDatabase();

    // Patient lookup — preserves prior behaviour (joins hospitals on hcode).
    const patients = await db.query<{ id: string; admit_date: string }>(
      'SELECT cp.id, cp.admit_date FROM cached_patients cp JOIN hospitals h ON h.id = cp.hospital_id WHERE cp.an = ? AND h.hcode = ? LIMIT 1',
      [an, hcode],
    );

    if (patients.length === 0) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const patient = patients[0];

    // Pull every partograph observation for this patient, oldest first so the
    // CDSS analyzers see them in clinical order.
    const observations = await db.query<ObservationRow>(
      `SELECT id, observe_datetime, hour_no,
              fetal_heart_rate, amniotic_fluid, amniotic_type_name, moulding,
              cervical_dilation_cm, descent_of_head,
              contraction_per_10min, contraction_duration_sec, contraction_strength,
              oxytocin_uml, oxytocin_drops_min, drugs_iv_fluids,
              pulse, bp_systolic, bp_diastolic, temperature,
              urine_volume_ml, urine_protein, urine_glucose, urine_acetone,
              note, entry_staff, source_system
         FROM cached_partograph_observations
         WHERE patient_id = ?
         ORDER BY observe_datetime ASC`,
      [patient.id],
    );

    const dtos: PartographObservationDto[] = observations.map((r) => ({
      id: r.id,
      observeDatetime: r.observe_datetime,
      hourNo: r.hour_no,
      fetalHeartRate: r.fetal_heart_rate,
      amnioticFluid: r.amniotic_fluid,
      amnioticTypeName: r.amniotic_type_name,
      moulding: r.moulding,
      cervicalDilationCm: toNumber(r.cervical_dilation_cm),
      descentOfHead: r.descent_of_head,
      contractionPer10Min: r.contraction_per_10min,
      contractionDurationSec: r.contraction_duration_sec,
      contractionStrength: r.contraction_strength,
      oxytocinUml: toNumber(r.oxytocin_uml),
      oxytocinDropsMin: r.oxytocin_drops_min,
      drugsIvFluids: r.drugs_iv_fluids,
      pulse: r.pulse,
      bpSystolic: r.bp_systolic,
      bpDiastolic: r.bp_diastolic,
      temperature: toNumber(r.temperature),
      urineVolumeMl: r.urine_volume_ml,
      urineProtein: r.urine_protein,
      urineGlucose: r.urine_glucose,
      urineAcetone: r.urine_acetone,
      note: r.note,
      entryStaff: r.entry_staff,
    }));

    const alerts = analyzePartograph({ an }, dtos);

    // Legacy entries[] — only rows with measured cervix dilation contribute,
    // matching the original generatePartogramEntries() contract.
    const entries = generatePartogramEntries(
      dtos
        .filter((o) => o.cervicalDilationCm !== null)
        .map((o) => ({
          measuredAt: o.observeDatetime,
          cervixCm: o.cervicalDilationCm as number,
        })),
    );

    const sourceSet = new Set(observations.map((o) => o.source_system));
    let source: 'hosxp' | 'webhook' | 'mixed' | 'none';
    if (sourceSet.size === 0) {
      source = 'none';
    } else if (sourceSet.size > 1) {
      source = 'mixed';
    } else {
      const only = sourceSet.values().next().value as string;
      source = only === 'webhook' ? 'webhook' : 'hosxp';
    }

    const response: PartogramResponse = {
      partogram: {
        startTime: patient.admit_date,
        entries,
        observations: dtos,
        alerts,
        severity: {
          highest: highestSeverity(alerts),
          counts: {
            critical: countBySeverity(alerts, 'CRITICAL'),
            alert: countBySeverity(alerts, 'ALERT'),
            warn: countBySeverity(alerts, 'WARN'),
            info: countBySeverity(alerts, 'INFO'),
          },
        },
        source,
        lastObservedAt: dtos.at(-1)?.observeDatetime ?? null,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    logger.error('partogram_api_failed', { error });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
