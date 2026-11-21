// GET/POST /api/patients/[an]/consults/[consultId]/messages — one HUB
// consult's thread: the conversation between the requesting hospital's care
// team and the provincial hub's OB-GYN team, bound to the admission's AN.
//
// The consult id arrives inside a patient path on purpose: the route first
// proves the consult really belongs to THIS admission (the AN in the URL),
// so a consult id of another hospital's AN can never fish out another
// patient's thread.
//
// The messages are the patient's clinical data: they are read and written
// through the same patient-visibility scope as every other patient resource.
// Who may join the conversation — the two sides of the consult, with the
// hub's side writing only as a clinician, and nothing written once the
// consult is COMPLETED — the service decides (consult-messages.ts).
//
// Read-only (ProviderID) sessions may GET the thread like any patient read,
// but the middleware already 403s their writes under /api/patients.
import { NextRequest, NextResponse } from 'next/server';
import { denyIfPatientOutOfScope, resolveRequestScope } from '@/lib/request-scope';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { loadConsultById, resolveConsultTarget } from '@/services/consults';
import {
  consultThreadAccess,
  createConsultMessage,
  listConsultMessages,
} from '@/services/consult-messages';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { logger } from '@/lib/logger';

export async function GET(
  _request: NextRequest,
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

    const consult = await loadConsultForAdmission(db, consultId, an, patient.hospital_id);
    if (!consult) {
      return NextResponse.json(
        { error: 'ไม่พบรายการปรึกษานี้ในการเข้าพัก (AN) ที่ระบุ', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const actor = {
      // The actor's OWN hospital decides which side they are on — the
      // session's hospital, never the patient's (null for the province /
      // system accounts, which are not a side of any consult).
      hospitalId: scope.ownHospitalId ?? '',
      role: session.user.role ?? '',
      userCid: session.user.userCid ?? null,
      name: auditActorFromSession(session).userName ?? null,
    };
    if (!consultThreadAccess(consult, actor).mayRead) {
      return NextResponse.json(
        { error: 'ไม่มีสิทธิ์เข้าบทสนทนาของคำปรึกษานี้', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'VIEW_PATIENT',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    const messages = await listConsultMessages(db, consultId);
    return NextResponse.json({ messages });
  } catch (error) {
    logger.error('consult_messages_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}

export async function POST(
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

    const consult = await loadConsultForAdmission(db, consultId, an, patient.hospital_id);
    if (!consult) {
      return NextResponse.json(
        { error: 'ไม่พบรายการปรึกษานี้ในการเข้าพัก (AN) ที่ระบุ', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
    const message = typeof body?.body === 'string' ? body.body : '';

    const sent = await createConsultMessage(
      db,
      consultId,
      {
        // The actor's OWN hospital decides which side they are on — the
        // session's hospital, never the patient's. Null for the province /
        // system accounts, which are not a side of any consult.
        hospitalId: scope.ownHospitalId ?? '',
        role: session.user.role ?? '',
        userCid: session.user.userCid ?? null,
        name: auditActorFromSession(session).userName ?? null,
      },
      { body: message },
    );
    if (!sent.ok) {
      return NextResponse.json(
        { error: { code: 'CONSULT_REJECTED', message: sent.error, details: null } },
        { status: sent.status },
      );
    }

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'CREATE_CONSULT_MESSAGE',
      resourceType: 'PATIENT',
      resourceId: an,
    });

    return NextResponse.json({ message: sent.message }, { status: 201 });
  } catch (error) {
    logger.error('consult_message_create_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}

/**
 * The consult the URL's admission owns. ANs are hospital-local and consult
 * ids are global — the consult must name THIS AN of THIS hospital, or the
 * thread it opens belongs to someone else's patient.
 */
async function loadConsultForAdmission(
  db: Awaited<ReturnType<typeof resolveRequestScope>>['db'],
  consultId: string,
  an: string,
  hospitalId: string,
) {
  const consult = await loadConsultById(db, consultId);
  if (!consult) return null;
  if (consult.an !== an || consult.hospitalId !== hospitalId) return null;
  return consult;
}
