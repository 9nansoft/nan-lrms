// T109: Health check endpoint tests — TDD: write tests FIRST
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { SeedOrchestrator } from '@/db/seeds/index';
import { SYNC_HEALTH } from '@/config/hospital-network';

describe('Health Check', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should return degraded status when no hospital has ever synced (grace state)', async () => {
    // All 26 seeded hospitals start UNKNOWN — zero usable integrations must
    // never be reported as 'healthy'.
    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);
    expect(status.status).toBe('degraded');
    expect(status.database).toBe('connected');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(status.hospitalConnections).toBeDefined();
    expect(status.hospitalConnections.total).toBe(40); // seeded NAN (14) + KK fixtures (26)
    expect(status.degradedReasons).toContain('no_hospitals_online');
  });

  it('should report hospital connection counts', async () => {
    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);
    expect(status.hospitalConnections.online).toBe(0);
    expect(status.hospitalConnections.offline).toBe(0);
    expect(status.hospitalConnections.unknown).toBe(40);
  });

  it('should return healthy status once at least one hospital is online with fresh data', async () => {
    await db.execute(
      "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE hcode = (SELECT hcode FROM hospitals LIMIT 1)",
      [new Date().toISOString()],
    );
    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);
    expect(status.status).toBe('healthy');
    expect(status.hospitalConnections.online).toBe(1);
    expect(status.hospitalConnections.stale).toBe(0);
    expect(status.degradedReasons).toEqual([]);
  });

  it('should degrade when an online hospital has stale sync data', async () => {
    const staleSync = new Date(
      Date.now() - (SYNC_HEALTH.staleAfterMinutes + 1) * 60 * 1000,
    ).toISOString();
    await db.execute(
      "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE hcode = (SELECT hcode FROM hospitals LIMIT 1)",
      [staleSync],
    );

    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);

    expect(status.hospitalConnections.online).toBe(1);
    expect(status.hospitalConnections.stale).toBe(1);
    expect(status.status).toBe('degraded');
    expect(status.degradedReasons).toContain('hospital_sync_stale');
  });

  it('should accept a fresh Date returned by a PostgreSQL adapter', async () => {
    const postgresDb = {
      query: async <T>(sql: string): Promise<T[]> => {
        if (sql.startsWith('SELECT 1')) return [{ ok: 1 }] as T[];
        return [{ connection_status: 'ONLINE', last_sync_at: new Date() }] as T[];
      },
    } as unknown as DatabaseAdapter;

    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(postgresDb);

    expect(status.hospitalConnections).toMatchObject({ online: 1, stale: 0 });
    expect(status.status).toBe('healthy');
  });

  it.each([
    ['missing', null],
    ['future-dated', new Date(Date.now() + 60 * 60 * 1000).toISOString()],
  ])('should degrade when an online hospital has %s sync data', async (_label, lastSyncAt) => {
    await db.execute(
      "UPDATE hospitals SET connection_status = 'ONLINE', last_sync_at = ? WHERE hcode = (SELECT hcode FROM hospitals LIMIT 1)",
      [lastSyncAt],
    );

    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);

    expect(status.hospitalConnections).toMatchObject({ online: 1, stale: 1 });
    expect(status.status).toBe('degraded');
    expect(status.degradedReasons).toContain('hospital_sync_stale');
  });
});
