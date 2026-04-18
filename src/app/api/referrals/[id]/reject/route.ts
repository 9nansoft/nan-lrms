// T10: PATCH /api/referrals/[id]/reject — reject a referral
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { rejectReferral } from '@/services/referral';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInit();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const { reason, suggestedAlternativeId } = body;

    if (!reason) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'reason จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referral = await rejectReferral(
      db,
      id,
      String(reason),
      suggestedAlternativeId != null ? String(suggestedAlternativeId) : undefined,
    );
    return NextResponse.json(referral);
  } catch (error) {
    logger.error('referral_reject_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
