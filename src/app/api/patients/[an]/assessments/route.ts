// GET /api/patients/[an]/assessments
// Returns the maternity assessment forms (HOSxP [LR] แบบฟอร์ม: แรกรับ /
// ระยะคลอด / หลังคลอด) cached for one admission.
//
// The forms are the ward's own clinical records, so the reader must be
// allowed to see that admission: the hospital that holds it must be inside
// the reader's visibility scope (its own hospital, a hospital below it in
// the node tree, or every hospital for the centre hospital / the province
// office). The hcode in the URL is a hint, never the authority — the patient
// row decides the hospital.
import { NextRequest, NextResponse } from 'next/server';
import { denyIfPatientOutOfScope, resolveRequestScope } from '@/lib/request-scope';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { getPatientMaternityAssessments } from '@/services/maternity-assessments';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { logger } from '@/lib/logger';
import type { MaternityAssessmentsResponse } from '@/types/maternity-assessments';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ an: string }> }) {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }
    const readerHcode = session.user.hospitalCode ?? '';

    const { an: patientId } = await params;
    const parsed = parsePatientId(patientId);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid patient ID format', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }
    const { hcode, an } = parsed;

    // The patient row carries the hospital the forms belong to — ANs are
    // hospital-local, so the query is scoped to it.
    const patients = await db.query<{
      id: string;
      hospital_id: string;
      journey_id: string | null;
      hcode: string;
      province_code: string | null;
    }>(
      `SELECT cp.id, cp.hospital_id, cp.journey_id, h.hcode, h.province_code
         FROM cached_patients cp
         JOIN hospitals h ON h.id = cp.hospital_id
        WHERE cp.an = ? AND h.hcode = ?
        LIMIT 1`,
      [an, hcode],
    );

    if (patients.length === 0) {
      return NextResponse.json({ error: 'Patient not found', code: 'NOT_FOUND' }, { status: 404 });
    }
    const patient = patients[0];

    // Tenant scope: the reader may read this admission when the hospital
    // holding it is inside the reader's visibility scope, or when the patient
    // was referred in to the reader. The URL's hcode never grants access on
    // its own.
    const denied = await denyIfPatientOutOfScope(
      db,
      scope,
      patient.hospital_id,
      patient.journey_id,
    );
    if (denied) {
      logger.warn('assessment_access_denied', {
        readerHcode,
        patientHcode: patient.hcode,
      });
      return denied;
    }

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'VIEW_PATIENT',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    const assessments = await getPatientMaternityAssessments(db, an, patient.hospital_id);

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
