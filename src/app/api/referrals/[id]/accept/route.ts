// T10: PATCH /api/referrals/[id]/accept — accept a referral
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { acceptReferral } from '@/services/referral';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await ensureInit();
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const { acceptedBy } = body;

    if (!acceptedBy) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'acceptedBy จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referral = await acceptReferral(db, id, String(acceptedBy));
    return NextResponse.json(referral);
  } catch (error) {
    console.error('Referral accept error:', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
