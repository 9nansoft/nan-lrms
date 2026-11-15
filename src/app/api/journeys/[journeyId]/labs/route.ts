// GET /api/journeys/[journeyId]/labs: every ANC lab result for a pregnancy.
// Includes decrypted HIV and syphilis results; see readJourneyLabsForHospital.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session-guard';
import { readJourneyLabsForHospital } from '@/services/journey-access';
import { ANC_LAB_ACCESS_DENIED } from '@/config/anc-lab-display';

const NO_STORE = { 'Cache-Control': 'private, no-store' };

function errorResponse(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, details: null } }, { status, headers: NO_STORE });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ journeyId: string }> },
) {
  try {
    await ensureInit();
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const { journeyId } = await params;
    const db = await getDatabase();
    const read = await readJourneyLabsForHospital(db, journeyId, session.user.hospitalCode);
    if (read.status === 'not_found') {
      return errorResponse(404, 'NOT_FOUND', 'ไม่พบข้อมูลการตั้งครรภ์');
    }
    if (read.status === 'denied') {
      logger.warn('journey_labs_access_denied', { journeyId });
      return errorResponse(
        403,
        'FORBIDDEN',
        `${ANC_LAB_ACCESS_DENIED.message} ${ANC_LAB_ACCESS_DENIED.remedy}`,
      );
    }

    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'VIEW_JOURNEY_LABS',
      resourceType: 'JOURNEY',
      resourceId: journeyId,
      metadata: { tier: read.tier },
    });
    return NextResponse.json({ results: read.results, tier: read.tier }, { headers: NO_STORE });
  } catch (error) {
    // Name only: a database error message can quote the values it failed on.
    logger.error('journey_labs_api_failed', {
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return errorResponse(
      500,
      'INTERNAL_ERROR',
      'โหลดผลตรวจไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้ให้แจ้งผู้ดูแลระบบ',
    );
  }
}
