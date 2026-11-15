import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session-guard';
import { readJourneyDetailForHospital } from '@/services/journey-access';

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

    const detail = await readJourneyDetailForHospital(db, journeyId, session.user.hospitalCode);
    if (detail === null) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'ไม่พบข้อมูลการตั้งครรภ์', details: null } },
        { status: 404 },
      );
    }

    // PDPA access log — fire-and-forget (tryLogAccess never throws).
    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'VIEW_JOURNEY',
      resourceType: 'JOURNEY',
      resourceId: journeyId,
      metadata: { serologyWithheld: detail.serologyWithheld },
    });

    // Can carry HIV and syphilis results, so it must not sit in a shared cache.
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('journey_detail_api_failed', { error });
    // In non-prod, surface the underlying error message so the client error
    // panel actually says WHY it failed ("column X does not exist", "syntax
    // error near …") instead of the generic Thai placeholder. Production keeps
    // the placeholder to avoid leaking DB internals to end users.
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      process.env.NODE_ENV === 'production'
        ? 'เกิดข้อผิดพลาด กรุณาลองใหม่'
        : `เกิดข้อผิดพลาด: ${detail}`;
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message, details: null } },
      { status: 500 },
    );
  }
}
