// PATCH /api/patients/[an]/consults/[consultId] — move a consult on.
//
// INTERNAL consults belong to the patient's hospital: only that hospital's
// care team touches them. HUB consults (the question sent up to the
// provincial hub's OB-GYN team) can be progressed by the requesting
// hospital, and ANSWERED by a clinician of the hub hospital — the service
// decides who may write what; this route resolves the actor from the
// session and the admission stays inside the patient-visibility scope.
import { NextRequest, NextResponse } from 'next/server';
import { denyIfPatientOutOfScope, resolveRequestScope } from '@/lib/request-scope';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { resolveConsultTarget, updatePatientConsult } from '@/services/consults';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { logger } from '@/lib/logger';
import type { ConsultStatus } from '@/types/api';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ an: string; consultId: string }> },
) {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { an: patientId, consultId } = await params;
    const parsed = parsePatientId(patientId);
    if (!parsed) {
      return NextResponse.json(
        { error: 'Invalid patient ID format', code: 'BAD_REQUEST' },
        { status: 400 },
      );
    }
    const { hcode, an } = parsed;

    const patient = await resolveConsultTarget(db, an, hcode);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const denied = await denyIfPatientOutOfScope(db, scope, patient.hospital_id, patient.journey_id);
    if (denied) return denied;

    const body = (await request.json().catch(() => null)) as {
      status?: unknown;
      advice?: unknown;
    } | null;
    const status =
      typeof body?.status === 'string' ? (body.status as ConsultStatus) : undefined;
    const advice = typeof body?.advice === 'string' ? body.advice : undefined;

    const updated = await updatePatientConsult(
      db,
      consultId,
      {
        // The actor's OWN hospital decides what they may write: the
        // requesting hospital progresses its request, the hub's clinicians
        // answer it. `scope.ownHospitalId` is the hospital the session
        // logged into, never the patient's — null only for the
        // province/system accounts, which may not answer consults.
        hospitalId: scope.ownHospitalId ?? '',
        role: session.user.role ?? '',
        userCid: session.user.userCid ?? null,
        name: auditActorFromSession(session).userName ?? null,
      },
      { status, advice },
    );
    if (!updated.ok) {
      return NextResponse.json(
        { error: { code: 'CONSULT_REJECTED', message: updated.error, details: null } },
        { status: updated.status },
      );
    }

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'UPDATE_CONSULT',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    return NextResponse.json({ consult: updated.consult });
  } catch (error) {
    logger.error('patient_consult_update_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
