// POST /api/patients/[an]/consults/[consultId]/messages/read — stamp one
// person's read receipt on a consult thread.
//
// The consult lists join against these receipts to show each viewer how
// many thread messages they have not seen; the ConsultThread component
// posts here while the thread is open (open = read). Same admission-proof
// and visibility scope as the messages route; no audit row — the receipt
// reveals nothing the audited GET has not already shown.
import { NextRequest, NextResponse } from 'next/server';
import { denyIfPatientOutOfScope, resolveRequestScope } from '@/lib/request-scope';
import { ensureInit } from '@/lib/ensure-init';
import { parsePatientId } from '@/lib/utils';
import { loadConsultById, resolveConsultTarget } from '@/services/consults';
import { markConsultThreadRead } from '@/services/consult-messages';
import { auditActorFromSession } from '@/lib/audit-actor';
import { logger } from '@/lib/logger';

export async function POST(
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

    // The consult must belong to THIS admission — a consult id of another
    // AN never opens (or marks read) this thread.
    const consult = await loadConsultById(db, consultId);
    if (!consult || consult.an !== an || consult.hospitalId !== patient.hospital_id) {
      return NextResponse.json(
        { error: 'ไม่พบรายการปรึกษานี้ในการเข้าพัก (AN) ที่ระบุ', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    const marked = await markConsultThreadRead(db, consultId, {
      // The actor's OWN hospital decides which side they are on — the
      // session's hospital, never the patient's.
      hospitalId: scope.ownHospitalId ?? '',
      role: session.user.role ?? '',
      userCid: session.user.userCid ?? null,
      name: auditActorFromSession(session).userName ?? null,
    });
    if (!marked.ok) {
      return NextResponse.json(
        { error: { code: 'CONSULT_REJECTED', message: marked.error, details: null } },
        { status: marked.status },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('consult_thread_read_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
