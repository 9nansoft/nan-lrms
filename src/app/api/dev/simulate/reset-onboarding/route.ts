// POST /api/dev/simulate/reset-onboarding — dev-only. Undoes the admin
// onboarding work: deactivates every registered hospital, wipes BMS
// configurations, and revokes all webhook API keys.
//
// Sibling to /api/dev/simulate/clear which preserves the hospital registry.
// This endpoint is the *opposite* — it wipes the registry so a subsequent
// onboarding flow can be tested from a true blank slate. Patient-side caches
// (patients / journeys / partograph / referrals) are NOT touched here; those
// belong to /api/dev/simulate/clear. Run both to fully reset.
//
// Hospitals are soft-deleted (is_active=false) rather than hard-deleted
// because cached_* tables hold FK references and a hard delete would cascade
// or fail (6 child tables per the DELETE handler in
// /api/admin/hospitals/[hcode]). The admin GET endpoint filters is_active=true
// so the row vanishes from the registered-hospitals list. To resurrect, the
// admin can re-add via the MoPH registry picker (this re-uses the existing
// row by hcode and flips is_active back to true).
import { NextResponse } from 'next/server';
import { simulationGuard } from '../_guard';
import { simulationOrchestrator } from '@/services/dev-simulation/orchestrator';
import { resetPool } from '@/services/dev-simulation/pool';
import {
  clearDevApiKeyCache,
  getDevApiKeyCacheSize,
} from '@/services/dev-simulation/api-keys';
import { SseManager } from '@/lib/sse';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function POST() {
  const guard = simulationGuard();
  if (guard) return guard;

  // Mirror /clear: drop in-memory key cache + stop orchestrator first so a
  // running sim tick can't re-create rows we're about to wipe.
  const cachedBefore = getDevApiKeyCacheSize();
  clearDevApiKeyCache();

  let orchestratorWasRunning = false;
  if (simulationOrchestrator.isRunning()) {
    orchestratorWasRunning = true;
    await simulationOrchestrator.stop();
  }

  await ensureInit();
  const db = await getDatabase();

  // Snapshot what we're about to remove for the response payload.
  const counts: Record<string, number> = {};

  const beforeWebhookKeys = await db.query<{ n: number }>(
    'SELECT COUNT(*) as n FROM webhook_api_keys',
  );
  counts['webhook_api_keys'] = Number(beforeWebhookKeys[0]?.n ?? 0);

  const beforeBmsConfig = await db.query<{ n: number }>(
    'SELECT COUNT(*) as n FROM hospital_bms_config',
  );
  counts['hospital_bms_config'] = Number(beforeBmsConfig[0]?.n ?? 0);

  const beforeActiveHospitals = await db.query<{ n: number }>(
    'SELECT COUNT(*) as n FROM hospitals WHERE is_active = true',
  );
  counts['hospitals (deactivated)'] = Number(beforeActiveHospitals[0]?.n ?? 0);

  // 1. Hard delete webhook keys — small table, no inbound FKs to other rows.
  await db.execute('DELETE FROM webhook_api_keys');

  // 2. Hard delete BMS configs — 1:1 child of hospitals; FKs go inward only.
  await db.execute('DELETE FROM hospital_bms_config');

  // 3. Soft-delete hospitals — flips is_active=false. Hard delete would fail
  //    against FK references from cached_patients / cached_anc_visits / ... .
  //    The admin GET filters is_active=true so the row vanishes from the UI.
  await db.execute(
    'UPDATE hospitals SET is_active = ?, connection_status = ?, updated_at = ? WHERE is_active = true',
    [false, 'disconnected', new Date().toISOString()],
  );

  // 4. Reset in-process state belt-and-suspenders.
  resetPool();
  clearDevApiKeyCache();

  // 5. Tell dashboards to re-fetch — onboarding rail / hospital table / map
  //    listen to `sync-complete` and call refreshAll().
  const sse = SseManager.getInstance();
  sse.broadcast('sync-complete', {
    hcode: '',
    patientsUpdated: 0,
    reason: 'onboarding_reset',
    timestamp: new Date().toISOString(),
  });

  logger.warn('sim_onboarding_reset', {
    counts,
    cacheEntriesPurged: cachedBefore,
    orchestratorWasRunning,
  });

  return NextResponse.json({
    ok: true,
    cleared: counts,
    diagnostics: {
      cacheEntriesPurged: cachedBefore,
      orchestratorWasRunning,
    },
  });
}
