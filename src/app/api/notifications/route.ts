// GET /api/notifications — list in-app alert notifications and unread badge
// count for the signed-in user (synced with BMS / LINE OA หมอพร้อม alerts).
import { NextResponse } from 'next/server';
import { ensureInit } from '@/lib/ensure-init';
import { resolveRequestScope } from '@/lib/request-scope';
import { listInAppAlerts } from '@/services/in-app-alerts';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const result = await listInAppAlerts(db, {
      userCid: session.user.userCid ?? null,
      hospitalId: scope.ownHospitalId,
      limit: 50,
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('notifications_list_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
