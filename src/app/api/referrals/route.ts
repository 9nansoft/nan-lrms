// T10: POST /api/referrals — initiate referral; GET /api/referrals — list pending referrals
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { initiateReferral, getPendingReferrals } from '@/services/referral';
import { UrgencyLevel } from '@/types/domain';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const body = await request.json() as Record<string, unknown>;
    const { journeyId, fromHospitalId, toHospitalId, reason, urgencyLevel } = body;

    if (!journeyId || !fromHospitalId || !toHospitalId || !reason || !urgencyLevel) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'journeyId, fromHospitalId, toHospitalId, reason และ urgencyLevel จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    if (!Object.values(UrgencyLevel).includes(urgencyLevel as UrgencyLevel)) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'urgencyLevel ไม่ถูกต้อง ต้องเป็น ROUTINE, URGENT หรือ EMERGENCY', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referral = await initiateReferral(db, {
      journeyId: String(journeyId),
      fromHospitalId: String(fromHospitalId),
      toHospitalId: String(toHospitalId),
      reason: String(reason),
      diagnosisCode: body.diagnosisCode != null ? String(body.diagnosisCode) : undefined,
      urgencyLevel: urgencyLevel as UrgencyLevel,
      initiatedBy: body.initiatedBy != null ? String(body.initiatedBy) : undefined,
    });

    return NextResponse.json(referral, { status: 201 });
  } catch (error) {
    logger.error('referral_create_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureInit();
    const { searchParams } = new URL(request.url);
    const hospital = searchParams.get('hospital');
    const dir = searchParams.get('dir');

    if (!hospital || !dir) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'query params hospital และ dir (in|out) จำเป็นต้องระบุ', details: null } },
        { status: 400 },
      );
    }

    if (dir !== 'in' && dir !== 'out') {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'dir ต้องเป็น in หรือ out', details: null } },
        { status: 400 },
      );
    }

    const db = await getDatabase();
    const referrals = await getPendingReferrals(db, hospital, dir);
    return NextResponse.json(referrals);
  } catch (error) {
    logger.error('referral_list_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
