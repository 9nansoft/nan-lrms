// GET /api/consults/inbox — the HUB consults addressed to the signed-in
// hospital's OB-GYN team.
//
// A HUB consult is the question a community hospital's care team sent UP to
// the provincial hub (the hospital this session logged into, whose
// service_type is PROVINCIAL_HUB). The clinicians of that hospital answer
// it; the requester only progresses it. The answering clinician is matched
// by their BMS session CID against the addressed doctor's CID — no users
// table is involved.
import { NextResponse } from 'next/server';
import { ensureInit } from '@/lib/ensure-init';
import { requireReadWriteSession } from '@/lib/session-guard';
import { resolveRequestScope } from '@/lib/request-scope';
import { countPendingHubConsults, listHubConsultInbox } from '@/services/consults';
import { logger } from '@/lib/logger';
import type { ConsultInboxResponse } from '@/types/api';

/** The roles that may work a hub's consult inbox. */
const INBOX_ROLES = new Set(['OBSTETRICIAN', 'ADMIN']);

/** The hospital id of the session's hospital code. */
async function resolveOwnHospitalId(
  db: Parameters<typeof listHubConsultInbox>[0],
  hcode: string,
): Promise<string | null> {
  if (!hcode) return null;
  const rows = await db.query<{ id: string }>(
    'SELECT id FROM hospitals WHERE hcode = ? LIMIT 1',
    [hcode],
  );
  return rows[0]?.id ?? null;
}

export async function GET() {
  try {
    await ensureInit();
    const session = await requireReadWriteSession();
    if (session instanceof NextResponse) return session;

    const role = session.user.role ?? '';
    if (!INBOX_ROLES.has(role)) {
      return NextResponse.json(
        { error: 'เฉพาะสูติแพทย์หรือผู้ดูแลระบบของโรงพยาบาลแม่ข่ายเท่านั้น', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const { db } = await resolveRequestScope();
    const targetHospitalId = await resolveOwnHospitalId(db, session.user.hospitalCode ?? '');
    if (!targetHospitalId) {
      const empty: ConsultInboxResponse = { consults: [], pendingCount: 0 };
      return NextResponse.json(empty);
    }

    const [consults, pendingCount] = await Promise.all([
      listHubConsultInbox(db, targetHospitalId),
      countPendingHubConsults(db, targetHospitalId),
    ]);

    const response: ConsultInboxResponse = { consults, pendingCount };
    return NextResponse.json(response);
  } catch (error) {
    logger.error('consult_inbox_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
