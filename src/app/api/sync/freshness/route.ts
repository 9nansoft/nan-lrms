// GET /api/sync/freshness — app-wide status strip data, scoped by the session.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ensureInit } from '@/lib/ensure-init';
import { getDatabase } from '@/db/connection';
import { cacheGetJson, cacheSetJson } from '@/lib/cache';
import { logger } from '@/lib/logger';
import { getSyncFreshness } from '@/services/sync-freshness';
import type { FreshnessSummary } from '@/types/sync-freshness';

const CACHE_TTL_SECONDS = 15;
const CACHE_ENABLED = process.env.NODE_ENV !== 'test';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const hcode = session.user.hospitalCode ?? null;
  const key = `cache:sync-freshness:${hcode ?? 'none'}`;
  try {
    await ensureInit();
    if (CACHE_ENABLED) {
      const cached = await cacheGetJson<FreshnessSummary>(key);
      if (cached) return NextResponse.json(cached);
    }
    const db = await getDatabase();
    const summary = await getSyncFreshness(db, { hcode });
    if (CACHE_ENABLED) await cacheSetJson(key, summary, CACHE_TTL_SECONDS);
    return NextResponse.json(summary);
  } catch (error) {
    logger.error('sync_freshness_failed', { hcode, error: String(error) });
    return NextResponse.json(
      {
        error: 'sync_freshness_failed',
        message: 'ตรวจสอบสถานะข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่หายให้แจ้งผู้ดูแลระบบ',
      },
      { status: 500 },
    );
  }
}
