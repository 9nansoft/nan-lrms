// T109: Health check endpoint tests — TDD: write tests FIRST
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { SeedOrchestrator } from '@/db/seeds/index';

describe('Health Check', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
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
