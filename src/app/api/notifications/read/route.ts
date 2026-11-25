// POST /api/notifications/read — mark one or all in-app alert notifications
// as read for the signed-in user.
import { NextRequest, NextResponse } from 'next/server';
import { ensureInit } from '@/lib/ensure-init';
import { resolveRequestScope } from '@/lib/request-scope';
import { markInAppAlertsRead } from '@/services/in-app-alerts';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      id?: unknown;
      markAll?: unknown;
    } | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : null;
    const markAll = body?.markAll === true || !id;

    const unreadCount = await markInAppAlertsRead(
      db,
      {
        userCid: session.user.userCid ?? null,
        hospitalId: scope.ownHospitalId,
      },
      { id, markAll },
    );

    return NextResponse.json({ ok: true, unreadCount });
  } catch (error) {
    logger.error('notifications_read_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
