// POST /api/dev/simulate/clear — dev-only. Wipes all patient / journey /
// labor data so the next simulation run starts from a clean slate.
//
// NOT scoped to "simulation-authored" rows — there's no source marker in the
// schema to tell simulator output from HOSxP / webhook data. In dev this is
// intentional; running this in production is blocked by the guard above.
//
// Order matters: delete children before parents to respect FK references.
import { NextResponse } from 'next/server';
import { simulationGuard } from '../_guard';
import { simulationOrchestrator } from '@/services/dev-simulation/orchestrator';
import { resetPool } from '@/services/dev-simulation/pool';
import { clearDevApiKeyCache } from '@/services/dev-simulation/api-keys';
import { SseManager } from '@/lib/sse';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function POST() {
  const guard = simulationGuard();
  if (guard) return guard;

  // Stop any in-flight simulation first; otherwise its next tick will race
  // with our DELETE and re-insert rows we just wiped.
  if (simulationOrchestrator.isRunning()) {
    await simulationOrchestrator.stop();
  }

  await ensureInit();
  const db = await getDatabase();

  // Delete children before parents. FKs: cached_anc_* → maternal_journeys,
  // cached_vital_signs + cpd_scores + cached_partograph_observations →
  // cached_patients, cached_patients.journey_id → maternal_journeys (nullable).
  const tables = [
    'cpd_scores',
    'cached_vital_signs',
    'cached_partograph_observations',
    'cached_anc_risks',
    'cached_anc_visits',
    'cached_newborns',
    'cached_referrals',
    'cached_patients',
    'maternal_journeys',
  ];

  const counts: Record<string, number> = {};
  for (const t of tables) {
    const before = await db.query<{ n: number }>(`SELECT COUNT(*) as n FROM ${t}`);
    counts[t] = Number(before[0]?.n ?? 0);
    await db.execute(`DELETE FROM ${t}`);
  }

  // Revoke simulator-issued webhook API keys so the next run gets fresh ones.
  // (The in-memory cache in api-keys.ts is also cleared here.)
  const keyRows = await db.query<{ id: string }>(
    `SELECT id FROM webhook_api_keys WHERE label LIKE 'sim:dev:%'`,
  );
  for (const row of keyRows) {
    await db.execute(`DELETE FROM webhook_api_keys WHERE id = ?`, [row.id]);
  }
  counts['webhook_api_keys (sim)'] = keyRows.length;

  // Reset the in-memory simulator pool + API key cache (no-op if never ran).
  resetPool();
  clearDevApiKeyCache();

  // Tell connected clients to re-fetch. Dashboards listen to `sync-complete`
  // and call refreshAll(), which invalidates all SWR caches that back the
  // KPIs, hospital table, high-risk list, trends panel, etc.
  const sse = SseManager.getInstance();
  sse.broadcast('sync-complete', {
    hcode: '',
    patientsUpdated: 0,
    reason: 'dev_data_cleared',
    timestamp: new Date().toISOString(),
  });

  logger.warn('sim_data_cleared', { counts });

  return NextResponse.json({
    ok: true,
    cleared: counts,
  });
}
