// T10: GET /api/dashboard/referrals — aggregate referral counts by status
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await ensureInit();
    const db = await getDatabase();

    const rows = await db.query<Record<string, unknown>>(
      `SELECT status, COUNT(*) as count FROM cached_referrals GROUP BY status`,
    );

    const inTransit = await db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM cached_referrals WHERE status = 'IN_TRANSIT'`,
    );

    const byStatus: Record<string, number> = {};
    let totalPending = 0;

    for (const row of rows) {
      const status = String(row.status);
      const count = Number(row.count);
      byStatus[status] = count;

      // Pending = not yet resolved (not REJECTED, not ARRIVED)
      if (status !== 'REJECTED' && status !== 'ARRIVED') {
        totalPending += count;
      }
    }

    return NextResponse.json({
      byStatus,
      inTransitCount: inTransit[0]?.count ?? 0,
      totalPending,
    });
  } catch (error) {
    logger.error('dashboard_referrals_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
