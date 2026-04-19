// T109: Health check service — centralized health status logic

import type { DatabaseAdapter } from '@/db/adapter';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  database: 'connected' | 'disconnected';
  uptime: number;
  timestamp: string;
  hospitalConnections: {
    total: number;
    online: number;
    offline: number;
    unknown: number;
  };
}

const startTime = Date.now();

export async function getHealthStatus(db: DatabaseAdapter): Promise<HealthStatus> {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';
  let hospitalConnections = { total: 0, online: 0, offline: 0, unknown: 0 };

  try {
    // Test DB connection with a simple query
    await db.query('SELECT 1 as ok');
    dbStatus = 'connected';

    // Get hospital connection stats
    const stats = await db.query<{ connection_status: string; count: number }>(
      "SELECT connection_status, COUNT(*) as count FROM hospitals WHERE is_active = true GROUP BY connection_status"
    );

    const total = await db.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM hospitals WHERE is_active = true"
    );
    hospitalConnections.total = total[0]?.count ?? 0;

    for (const row of stats) {
      if (row.connection_status === 'ONLINE') hospitalConnections.online = row.count;
      else if (row.connection_status === 'OFFLINE') hospitalConnections.offline = row.count;
      else hospitalConnections.unknown += row.count;
    }
  } catch {
    dbStatus = 'disconnected';
  }

  const anyOffline = hospitalConnections.offline > 0;
  const status: HealthStatus['status'] = dbStatus === 'disconnected' ? 'unhealthy' : anyOffline ? 'degraded' : 'healthy';

  return {
    status,
    database: dbStatus,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    hospitalConnections,
  };
}
