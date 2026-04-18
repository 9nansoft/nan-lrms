// GET /api/journeys/[journeyId]/newborns — birth outcomes for a specific journey
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import type { NewbornEntry } from '@/types/api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ journeyId: string }> },
) {
  try {
    await ensureInit();
    const { journeyId } = await params;
    const db = await getDatabase();

    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM cached_newborns WHERE journey_id = ? ORDER BY infant_number`,
      [journeyId],
    );

    const newborns: NewbornEntry[] = rows.map((nb) => ({
      infantNumber: nb.infant_number as number,
      sex: nb.sex as string | null,
      birthWeightG: nb.birth_weight_g as number | null,
      apgar1min: nb.apgar_1min as number | null,
      apgar5min: nb.apgar_5min as number | null,
      bornAt: nb.born_at as string,
    }));

    return NextResponse.json({ newborns });
  } catch (error) {
    logger.error('newborns_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
