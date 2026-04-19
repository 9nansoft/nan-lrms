'use client';
import { executeSql } from '@/lib/bms-browser-client';
import { MATERNITY_WARDS, getQuery, type DatabaseDialect } from '@/config/hosxp-queries';
import type { ConnectionConfig } from '@/types/bms-browser';
import type { MaternityWard } from '@/types/maternity-ward';

// HOSxP tunnels behind BMS Session API are typically MySQL.
// Until we expose the dialect via the session, default to mysql for the
// browser-side queries. Server-side polling already detects via
// detectDatabaseType(); this client mirror does the same when needed in v2.
const DEFAULT_DIALECT: DatabaseDialect = 'mysql';

export async function listMaternityWards(config: ConnectionConfig): Promise<MaternityWard[]> {
  const sql = getQuery(MATERNITY_WARDS, DEFAULT_DIALECT);
  const r = await executeSql<MaternityWard>(sql, config);
  return r.data;
}
