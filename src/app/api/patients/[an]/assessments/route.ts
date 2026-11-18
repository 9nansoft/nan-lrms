// GET /api/patients/[an]/assessments
// Returns the maternity assessment forms (HOSxP [LR] แบบฟอร์ม: แรกรับ /
// ระยะคลอด / หลังคลอด) cached for one admission.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { getPatientMaternityAssessments } from '@/services/maternity-assessments';
import { logger } from '@/lib/logger';
import type { MaternityAssessmentsResponse } from '@/types/maternity-assessments';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ an: string }> }) {
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

    // The patient row carries the hospital the forms belong to — ANs are
    // hospital-local, so the query is scoped to it.
    const patients = await db.query<{ id: string; hospital_id: string }>(
      `SELECT cp.id, cp.hospital_id
         FROM cached_patients cp
         JOIN hospitals h ON h.id = cp.hospital_id
        WHERE cp.an = ? AND h.hcode = ?
        LIMIT 1`,
      [an, hcode],
    );

    if (patients.length === 0) {
      return NextResponse.json({ error: 'Patient not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const assessments = await getPatientMaternityAssessments(db, an, patients[0].hospital_id);

    const response: MaternityAssessmentsResponse = { assessments };
    return NextResponse.json(response);
  } catch (error) {
    logger.error('assessments_api_failed', { error });
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 },
    );
  }
}
