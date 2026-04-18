// GET /api/dashboard/outcomes — neonatal KPIs, optionally filtered by hospital
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { getNewbornKPIs } from '@/services/newborn';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    await ensureInit();
    const db = await getDatabase();
    const hospitalId = request.nextUrl.searchParams.get('hospital_id') ?? undefined;

    const kpis = await getNewbornKPIs(db, hospitalId);
    return NextResponse.json(kpis);
  } catch (error) {
    logger.error('outcomes_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
