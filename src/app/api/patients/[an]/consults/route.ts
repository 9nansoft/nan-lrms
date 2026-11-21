// GET/POST /api/patients/[an]/consults — the consults of one admission, and
// the request to add one.
//
// A consult is the care team asking one of the hospital's own consult
// doctors for advice about a patient who stays here. It is NOT a referral
// (that moves the patient to another hospital — /api/referrals).
//
// The consult doctors come from the hospital's consult list, which the admin
// manages (HospitalEditDialog). The records are the patient's clinical data:
// they are read and written through the same patient-visibility scope as
// every other patient resource.
import { NextRequest, NextResponse } from 'next/server';
import { denyIfPatientOutOfScope, resolveRequestScope } from '@/lib/request-scope';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import {
  consultHubInfoFor,
  createPatientConsult,
  listConsultDoctors,
  listPatientConsults,
  resolveConsultTarget,
} from '@/services/consults';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { logger } from '@/lib/logger';
import type { ConsultUrgency, PatientConsultsResponse } from '@/types/api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ an: string }> },
) {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { an: patientId } = await params;
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

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'VIEW_PATIENT',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    const [consults, doctors, hub] = await Promise.all([
      listPatientConsults(db, an, patient.hospital_id, session.user.userCid ?? null),
      listConsultDoctors(db, patient.hospital_id),
      consultHubInfoFor(db, patient.hospital_id),
    ]);

    const response: PatientConsultsResponse = { consults, doctors, hub };
    return NextResponse.json(response);
  } catch (error) {
    logger.error('patient_consults_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ an: string }> },
) {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const { an: patientId } = await params;
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
      doctorId?: unknown;
      reason?: unknown;
      mode?: unknown;
      urgency?: unknown;
    } | null;
    const doctorId = typeof body?.doctorId === 'string' ? body.doctorId.trim() : '';
    const reason = typeof body?.reason === 'string' ? body.reason : '';
    const mode = body?.mode === 'HUB' ? 'HUB' : 'INTERNAL';
    const urgency =
      body?.urgency === 'URGENT' || body?.urgency === 'EMERGENCY' || body?.urgency === 'ROUTINE'
        ? (body.urgency as ConsultUrgency)
        : undefined;
    if (!doctorId) {
      return NextResponse.json(
        { error: 'กรุณาเลือกแพทย์ที่ต้องการปรึกษา', code: 'DOCTOR_REQUIRED' },
        { status: 400 },
      );
    }

    const actor = auditActorFromSession(session);
    const created = await createPatientConsult(db, {
      an,
      hospitalId: patient.hospital_id,
      patientId: patient.id,
      journeyId: patient.journey_id,
      doctorId,
      reason,
      mode,
      urgency,
      requestedByCid: session.user.userCid ?? null,
      requestedByName: actor.userName ?? null,
    });
    if (!created.ok) {
      return NextResponse.json(
        { error: { code: 'CONSULT_REJECTED', message: created.error, details: null } },
        { status: created.status },
      );
    }

    await tryLogAccess(db, {
      ...actor,
      action: 'CREATE_CONSULT',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    return NextResponse.json({ consult: created.consult }, { status: 201 });
  } catch (error) {
    logger.error('patient_consult_create_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
