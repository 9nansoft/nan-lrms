// T10: PATCH /api/referrals/[id]/arrive — confirm patient arrival at receiving hospital
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { confirmArrival } from '@/services/referral';
import { logger } from '@/lib/logger';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInit();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const { receivingAn } = body;

    if (!receivingAn) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'receivingAn จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referral = await confirmArrival(db, id, String(receivingAn));
    return NextResponse.json(referral);
  } catch (error) {
    logger.error('referral_arrive_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
