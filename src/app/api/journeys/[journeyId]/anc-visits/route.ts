import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import type { AncVisitEntry } from '@/types/api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ journeyId: string }> },
) {
  try {
    await ensureInit();
    const { journeyId } = await params;
    const db = await getDatabase();

    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM cached_anc_visits WHERE journey_id = ? ORDER BY visit_date`,
      [journeyId],
    );

    const visits: AncVisitEntry[] = rows.map((v) => ({
      visitDate: v.visit_date as string,
      visitNumber: v.visit_number as number,
      gaWeeks: v.ga_weeks as number | null,
      fundalHeightCm: v.fundal_height_cm as number | null,
      weightKg: v.weight_kg as number | null,
      bpSystolic: v.bp_systolic as number | null,
      bpDiastolic: v.bp_diastolic as number | null,
      fetalHr: v.fetal_hr as number | null,
    }));

    return NextResponse.json({ visits });
  } catch (error) {
    logger.error('anc_visits_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
