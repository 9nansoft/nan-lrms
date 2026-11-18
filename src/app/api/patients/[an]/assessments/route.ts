// GET /api/patients/[an]/assessments
// Returns the maternity assessment forms (HOSxP [LR] แบบฟอร์ม: แรกรับ /
// ระยะคลอด / หลังคลอด) cached for one admission.
//
// The forms are the ward's own clinical records, so the reader must be
// allowed to see that admission: the hospital that holds it, or an account
// of the same province (the province-wide view NN-LRMS is built around).
// The hcode in the URL is a hint, never the authority — the patient row
// decides the hospital.
import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { auth } from '@/lib/auth';
import { getPatientMaternityAssessments } from '@/services/maternity-assessments';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { APP_PROVINCE_CODE } from '@/config/hospitals';
import { logger } from '@/lib/logger';
import type { MaternityAssessmentsResponse } from '@/types/maternity-assessments';

/**
 * Accounts that stand for the PROVINCE rather than for one hospital. The
 * สสจ. has no hospital row of its own to read a province from, so its
 * province is named here — explicitly, not as "every special login code may
 * read every admission".
 */
const PROVINCE_ACCOUNT_PROVINCE: Record<string, string> = {
  '00042': APP_PROVINCE_CODE, // สสจ.น่าน
};

export async function GET(_request: NextRequest, { params }: { params: Promise<{ an: string }> }) {
  try {
    await ensureInit();
    const session = await auth();
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
    const db = await getDatabase();

    // The patient row carries the hospital the forms belong to — ANs are
    // hospital-local, so the query is scoped to it.
    const patients = await db.query<{
      id: string;
      hospital_id: string;
      hcode: string;
      province_code: string | null;
    }>(
      `SELECT cp.id, cp.hospital_id, h.hcode, h.province_code
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

    // Tenant scope: a hospital reads its own admissions; an account of the
    // same province reads the province's. The URL's hcode never grants
    // access.
    const readerRows = await db.query<{ province_code: string | null }>(
      'SELECT province_code FROM hospitals WHERE hcode = ?',
      [readerHcode],
    );
    const readerProvince =
      PROVINCE_ACCOUNT_PROVINCE[readerHcode] ?? readerRows[0]?.province_code ?? null;
    const patientProvince = patient.province_code ?? null;
    const sameProvince =
      readerProvince !== null && readerProvince !== '' && readerProvince === patientProvince;

    if (patient.hcode !== readerHcode && !sameProvince) {
      logger.warn('assessment_access_denied', {
        readerHcode,
        readerProvince,
        patientHcode: patient.hcode,
        patientProvince,
      });
      return NextResponse.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
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
