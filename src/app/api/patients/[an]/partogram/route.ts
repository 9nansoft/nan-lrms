// T068: GET /api/patients/[an]/partogram — partogram data with alert/action lines
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { generatePartogramEntries } from '@/services/partogram';
import { logger } from '@/lib/logger';
import type { PartogramResponse } from '@/types/api';

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

    // Get patient ID from AN
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

    // Get vital signs with cervix measurements
    const vitals = await db.query<{
      measured_at: string;
      cervix_cm: number;
    }>(
      'SELECT measured_at, cervix_cm FROM cached_vital_signs WHERE patient_id = ? AND cervix_cm IS NOT NULL ORDER BY measured_at ASC',
      [patient.id],
    );

    const vitalInputs = vitals.map((v) => ({
      measuredAt: v.measured_at,
      cervixCm: v.cervix_cm,
    }));

    const entries = generatePartogramEntries(vitalInputs);

    const response: PartogramResponse = {
      partogram: {
        startTime: patient.admit_date,
        entries,
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
