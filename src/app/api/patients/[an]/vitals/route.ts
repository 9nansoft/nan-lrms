// T073: GET /api/patients/[an]/vitals — vital signs time series
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type { VitalSignsResponse } from '@/types/api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ an: string }> },
) {
  try {
    await ensureInit();
    const { an: patientId } = await params;
    const parsed = parsePatientId(patientId);
    if (!parsed) {
      return NextResponse.json({ error: 'Invalid patient ID format', code: 'BAD_REQUEST' }, { status: 400 });
    }
    const { hcode, an } = parsed;
    const db = await getDatabase();

    // Get patient ID
    const patients = await db.query<{ id: string }>(
      'SELECT cp.id FROM cached_patients cp JOIN hospitals h ON h.id = cp.hospital_id WHERE cp.an = ? AND h.hcode = ? LIMIT 1',
      [an, hcode],
    );

    if (patients.length === 0) {
      return NextResponse.json(
        { error: 'Patient not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const vitals = await db.query<{
      measured_at: string;
      maternal_hr: number | null;
      fetal_hr: string | null;
      sbp: number | null;
      dbp: number | null;
      pph_amount_ml: number | null;
    }>(
      'SELECT measured_at, maternal_hr, fetal_hr, sbp, dbp, pph_amount_ml FROM cached_vital_signs WHERE patient_id = ? ORDER BY measured_at ASC',
      [patients[0].id],
    );

    let response: VitalSignsResponse = {
      vitals: vitals.map((v) => ({
        measuredAt: v.measured_at,
        maternalHr: v.maternal_hr,
        fetalHr: v.fetal_hr,
        sbp: v.sbp,
        dbp: v.dbp,
        pphAmountMl: v.pph_amount_ml,
      })),
    };

    // Fallback: when no explicit cached_vital_signs rows exist, derive vitals
    // from partograph observations. Partograph captures pulse + BP + fetal HR
    // at every timepoint, which is exactly what CurrentVitalsPanel displays.
    // This matters for webhook-ingested patients (simulator + non-HOSxP
    // hospitals) that only write to cached_partograph_observations, not to
    // cached_vital_signs. No-op when vitals is non-empty so HOSxP hospitals
    // (which write both tables) keep their explicit per-minute nurse notes.
    if (response.vitals.length === 0) {
      const obs = await db.query<{
        observe_datetime: string;
        pulse: number | null;
        bp_systolic: number | null;
        bp_diastolic: number | null;
        fetal_heart_rate: number | null;
      }>(
        `SELECT observe_datetime, pulse, bp_systolic, bp_diastolic, fetal_heart_rate
         FROM cached_partograph_observations
         WHERE patient_id = ?
         ORDER BY observe_datetime ASC`,
        [patients[0].id],
      );
      response = {
        vitals: obs.map((o) => ({
          measuredAt: o.observe_datetime,
          maternalHr: o.pulse,
          fetalHr: o.fetal_heart_rate != null ? String(o.fetal_heart_rate) : null,
          sbp: o.bp_systolic,
          dbp: o.bp_diastolic,
          pphAmountMl: null,
        })),
      };
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error('vitals_api_failed', { error });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
