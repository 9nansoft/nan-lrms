// T049: GET /api/dashboard — province dashboard summary
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { getProvinceDashboard, getStageKPIs, getDashboardAlerts } from '@/services/dashboard';
import { auth } from '@/lib/auth';
import { logAccess } from '@/services/audit';
import { ensureInit } from '@/lib/ensure-init';

export async function GET() {
  try {
    await ensureInit();
    const db = await getDatabase();

    // T091: Audit logging
    const session = await auth();
    if (session?.user) {
      const userId = (session.user as unknown as { id?: string }).id ?? 'unknown';
      await logAccess(db, {
        userId,
        action: 'VIEW_DASHBOARD',
        resourceType: 'DASHBOARD',
      }).catch(() => {}); // Don't fail request on audit error
    }

    const [result, stageKPIs, alerts] = await Promise.all([
      getProvinceDashboard(db),
      getStageKPIs(db),
      getDashboardAlerts(db),
    ]);
    return NextResponse.json({ ...result, stageKPIs, alerts });
  } catch (error) {
    console.error('Dashboard API error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
