// T109: Health check endpoint tests — TDD: write tests FIRST
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '@/db/sqlite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables/index';
import { SeedOrchestrator } from '@/db/seeds/index';

describe('Health Check', () => {
  let db: SqliteAdapter;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await SchemaSync.sync(db, ALL_TABLES, 'sqlite');
    await new SeedOrchestrator().run(db);
  });

  afterEach(async () => {
    await db.close();
  });

  it('should return health status with database connected', async () => {
    // Test the getHealthStatus service function
    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);
    expect(status.status).toBe('healthy');
    expect(status.database).toBe('connected');
    expect(status.uptime).toBeGreaterThanOrEqual(0);
    expect(status.hospitalConnections).toBeDefined();
    expect(status.hospitalConnections.total).toBe(26); // seeded KK hospitals
  });

  it('should report hospital connection counts', async () => {
    const { getHealthStatus } = await import('@/services/health');
    const status = await getHealthStatus(db);
    expect(status.hospitalConnections.online).toBe(0);
    expect(status.hospitalConnections.offline).toBe(0);
    expect(status.hospitalConnections.unknown).toBe(26);
  });
});
