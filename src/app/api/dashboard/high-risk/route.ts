// GET /api/dashboard/high-risk — high-risk patients across all hospitals
import { NextResponse } from 'next/server';
import { getHighRiskPatients } from '@/services/dashboard';
import { resolveRequestScope } from '@/lib/request-scope';
import { scopeCacheSuffix } from '@/services/visibility-scope';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { cacheGetJson, cacheSetJson, cacheSetNx } from '@/lib/cache';
import type { HighRiskPatient } from '@/types/api';

// Same caching + audit-sampling posture as /api/dashboard (2026-07-17
// incident: this route was uncached and audited every poll — ~40 req/s of
// full recomputes + audit INSERTs). The cached payload lives in the same
// compose-internal Redis that already holds sync-run records; note it now
// carries decrypted display names for up to 50 patients (same data every
// authenticated dashboard sees).
//
// The cache key carries the viewer's scope: the roster is patient data, so a
// hospital's narrower roster must never be served from the province-wide
// entry (or the other way round).
const HR_CACHE_TTL_SECONDS = 30;
const HR_STALE_TTL_SECONDS = 300;
const HR_LOCK_TTL_SECONDS = 15;
const HR_CACHE_ENABLED = process.env.NODE_ENV !== 'test';
const AUDIT_SAMPLE_WINDOW_SECONDS = 300;

function hrCacheKeys(scopeSuffix: string) {
  return {
    main: `cache:dashboard:high-risk:${scopeSuffix}`,
    stale: `cache:dashboard:high-risk:${scopeSuffix}:stale`,
    lock: `cache:dashboard:high-risk:${scopeSuffix}:lock`,
  };
}

export async function GET() {
  try {
    await ensureInit();
    const { db, scope, session } = await resolveRequestScope();

    // Audit logging — sampled: one VIEW row per user per window.
    if (session?.user) {
      const actor = auditActorFromSession(session);
      const userKey = String(actor.userId ?? actor.userName ?? 'anonymous');
      if (await cacheSetNx(`audit:sample:VIEW_HIGH_RISK:${userKey}`, AUDIT_SAMPLE_WINDOW_SECONDS)) {
        await tryLogAccess(db, {
          ...actor,
          action: 'VIEW_HIGH_RISK_PATIENTS',
          resourceType: 'DASHBOARD',
        });
      }
    }

    const keys = hrCacheKeys(scopeCacheSuffix(scope));

    if (HR_CACHE_ENABLED) {
      const cached = await cacheGetJson<HighRiskPatient[]>(keys.main);
      if (cached) return NextResponse.json({ patients: cached });
      const claimed = await cacheSetNx(keys.lock, HR_LOCK_TTL_SECONDS);
      if (!claimed) {
        const stale = await cacheGetJson<HighRiskPatient[]>(keys.stale);
        if (stale) return NextResponse.json({ patients: stale });
      }
    }

    const patients = await getHighRiskPatients(db, 500, scope);
    if (HR_CACHE_ENABLED) {
      await cacheSetJson(keys.main, patients, HR_CACHE_TTL_SECONDS);
      await cacheSetJson(keys.stale, patients, HR_STALE_TTL_SECONDS);
    }
    return NextResponse.json({ patients });
  } catch (error) {
    logger.error('high_risk_patients_api_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'เกิดข้อผิดพลาด กรุณาลองใหม่', details: null } },
      { status: 500 },
    );
  }
}
