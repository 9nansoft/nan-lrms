// T109: Health check service — centralized health status logic

import type { DatabaseAdapter } from '@/db/adapter';
import { classifySyncHealth, isNonReportingHcode } from '@/config/hospital-network';
import { cacheStatus } from '@/lib/cache';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  cache: { backend: 'redis' | 'memory'; degraded: boolean; degradedSince: string | null };
  uptime: number;
  timestamp: string;
  hospitalConnections: {
    total: number;
    online: number;
    offline: number;
    unknown: number;
    stale: number;
  };
  degradedReasons: string[];
}

const startTime = Date.now();

export async function getHealthStatus(db: DatabaseAdapter): Promise<HealthStatus> {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  const hospitalConnections = { total: 0, online: 0, offline: 0, unknown: 0, stale: 0 };

  try {
    // Test DB connection with a simple query
    await db.query('SELECT 1 as ok');
    dbStatus = 'connected';

    // Get hospital connection stats
    const hospitals = (
      await db.query<{
        hcode: string;
        connection_status: string;
        last_sync_at: string | Date | null;
      }>('SELECT hcode, connection_status, last_sync_at FROM hospitals WHERE is_active = true')
    ).filter((h) => !isNonReportingHcode(h.hcode)); // pseudo-hospitals never sync
    const now = new Date();
    hospitalConnections.total = hospitals.length;

    for (const hospital of hospitals) {
      if (hospital.connection_status === 'ONLINE') {
        hospitalConnections.online += 1;
        const lastSyncAt =
          hospital.last_sync_at instanceof Date
            ? hospital.last_sync_at.toISOString()
            : hospital.last_sync_at;
        const syncTime = lastSyncAt ? new Date(lastSyncAt).getTime() : NaN;
        const hasValidPastSync = Number.isFinite(syncTime) && syncTime <= now.getTime();
        if (
          !hasValidPastSync ||
          classifySyncHealth(hospital.connection_status, lastSyncAt, now) !== 'ok'
        ) {
          hospitalConnections.stale += 1;
        }
      } else if (hospital.connection_status === 'OFFLINE') hospitalConnections.offline += 1;
      else hospitalConnections.unknown += 1;
    }
  } catch {
    dbStatus = 'disconnected';
  }

  const cache = await cacheStatus();
  const degradedReasons: string[] = [];
  if (hospitalConnections.offline > 0) degradedReasons.push('hospitals_offline');
  if (hospitalConnections.stale > 0) degradedReasons.push('hospital_sync_stale');
  if (cache.degraded) degradedReasons.push('redis_unavailable');
  if (hospitalConnections.total > 0 && hospitalConnections.online === 0) {
    // Grace-state: nothing has synced (yet) — never present this as healthy.
    degradedReasons.push('no_hospitals_online');
  }
  const status: HealthStatus['status'] =
    dbStatus === 'disconnected' ? 'unhealthy' : degradedReasons.length > 0 ? 'degraded' : 'healthy';

  return {
    status,
    database: dbStatus,
    cache: { backend: cache.backend, degraded: cache.degraded, degradedSince: cache.degradedSince },
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    hospitalConnections,
    degradedReasons,
  };
}
