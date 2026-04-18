// T049: GET /api/dashboard — province dashboard summary
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { getProvinceDashboard, getStageKPIs, getDashboardAlerts } from '@/services/dashboard';
import { auth } from '@/lib/auth';
import { logAccess } from '@/services/audit';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await ensureInit();
    const db = await getDatabase();

    // T091: Audit logging
    const session = await auth();
    if (session?.user) {
      await logAccess(db, {
        userId: session.user.id,
        action: 'VIEW_DASHBOARD',
        resourceType: 'DASHBOARD',
      }).catch((error) => logger.warn('audit_log_failed', { action: 'VIEW_DASHBOARD', error }));
    }

    const [result, stageKPIs, alerts] = await Promise.all([
      getProvinceDashboard(db),
      getStageKPIs(db),
      getDashboardAlerts(db),
    ]);
    return NextResponse.json({ ...result, stageKPIs, alerts });
  } catch (error) {
    logger.error('dashboard_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
