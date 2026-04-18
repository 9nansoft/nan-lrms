// T10: PATCH /api/referrals/[id]/transit — mark referral as in transit
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { markInTransit } from '@/services/referral';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInit();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const { transportMode } = body;

    if (!transportMode) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'transportMode จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referral = await markInTransit(db, id, String(transportMode));
    return NextResponse.json(referral);
  } catch (error) {
    logger.error('referral_transit_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
