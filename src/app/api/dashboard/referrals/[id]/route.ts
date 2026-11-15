// GET /api/dashboard/referrals/[id] — full referral detail with lifecycle
// milestones and patient context. Thin handler over referral-list service.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { requireSession } from '@/lib/session-guard';
import { readReferralDetailForHospital } from '@/services/journey-access';
import type { ReferralDetailResponse } from '@/types/api';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureInit();
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const db = await getDatabase();
    const { id } = await params;

    const referral = await readReferralDetailForHospital(db, id, session.user.hospitalCode);
    if (!referral) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'ไม่พบรายการส่งต่อนี้', details: null } },
        { status: 404 },
      );
    }

    const response: ReferralDetailResponse = { referral };
    // What this returns depends on who asks, so it must not sit in a shared cache.
    return NextResponse.json(response, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    logger.error('dashboard_referral_detail_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
