import { describe, it, expect, afterEach, vi } from 'vitest';
import { getDriverType, getDatabase, resetDatabaseInstance } from '@/db/connection';

// SQLite was removed from the codebase: every adapter now speaks the
// PostgreSQL dialect (PostgresAdapter in production, PGlite in dev/test).
// getDriverType therefore has a single answer, and getDatabase() in the
// test environment must boot an in-memory PGlite — not require DATABASE_URL.
describe('getDriverType', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns postgresql in the test environment', () => {
    expect(getDriverType()).toBe('postgresql');
  });

  it('returns postgresql for PGlite dev mode', () => {
    vi.stubEnv('USE_PGLITE', 'true');
    expect(getDriverType()).toBe('postgresql');
  });

  it('returns postgresql for production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getDriverType()).toBe('postgresql');
  });
});

describe('getDatabase in the test environment', () => {
  afterEach(async () => {
    resetDatabaseInstance();
  });

  it('boots an in-memory pglite adapter without DATABASE_URL', async () => {
    resetDatabaseInstance();
    const db = await getDatabase();
    const rows = await db.query<{ ok: number }>('SELECT 1 AS ok');
    expect(rows[0].ok).toBe(1);
    const { PgliteAdapter } = await import('@/db/pglite-adapter');
    expect(db).toBeInstanceOf(PgliteAdapter);
  });
});
