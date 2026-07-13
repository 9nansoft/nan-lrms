import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { UserRole } from '@/types/domain';
import { testSessionUser } from '../../helpers/session';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({ auth: async () => (mockSessionUser ? { user: mockSessionUser } : null) }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST as clearRoute } from '@/app/api/dev/simulate/clear/route';

describe('simulation route authorization', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = null;
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEV_SIMULATION_ENABLED', 'true');
    vi.stubEnv('ADMIN_ALLOWED_CIDS', '');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('404s under production defaults regardless of session', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    mockSessionUser = testSessionUser({ hospitalCode: '10670', role: UserRole.ADMIN });
    const res = await clearRoute();
    expect(res.status).toBe(404);
  });

  it('401s without a session even when simulation is enabled', async () => {
    const res = await clearRoute();
    expect(res.status).toBe(401);
  });

  it('403s for a non-admin session', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', role: UserRole.NURSE });
    const res = await clearRoute();
    expect(res.status).toBe(403);
  });

  it('403s for a readonly session even with the ADMIN role', async () => {
    mockSessionUser = testSessionUser({
      hospitalCode: '10670',
      role: UserRole.ADMIN,
      accessMode: 'readonly',
    });
    const res = await clearRoute();
    expect(res.status).toBe(403);
  });

  it('allows an admin readwrite session in development', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', role: UserRole.ADMIN });
    const res = await clearRoute();
    expect(res.status).toBe(200);
  });
});
