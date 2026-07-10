// T023: Connection factory — environment-based routing.
//
// Every adapter speaks the PostgreSQL dialect: PostgresAdapter (pg.Pool)
// in production, embedded pglite (@electric-sql/pglite) for dev mode and
// tests. The SQLite driver was removed — its dialect differences (TEXT
// dates, INTEGER booleans, string NUMERIC) kept masking production-only
// bugs in the test suite.

import type { DatabaseAdapter } from './adapter';
import { logger } from '@/lib/logger';

// HMR- and bundle-safe singleton. In Next.js dev, route handlers are bundled
// separately and modules reload on HMR, so a plain `let instance` can produce
// multiple DB adapters in the same process — e.g. the orchestrator's INSERTs
// go into one PgliteAdapter's WASM VM while the webhook route's SELECT runs
// against a different one. Writes become invisible to reads. Pinning on
// `global` gives one adapter per Node process regardless of bundle or HMR
// (matches the pattern already used for __pgliteLock and __simApiKeyCache).
interface DbSingleton {
  instance: DatabaseAdapter | null;
}
const _global = global as unknown as { __dbSingleton?: DbSingleton };
const _singleton: DbSingleton = _global.__dbSingleton ?? { instance: null };
if (!_global.__dbSingleton) _global.__dbSingleton = _singleton;

// In-process Postgres dev mode via @electric-sql/pglite. Useful when you
// want real Postgres dialect without standing up a server. Persists to a
// local directory so data survives restarts.
export function isPgliteEnabled(): boolean {
  return process.env.USE_PGLITE === 'true';
}

// Schema dialect for whichever adapter getDatabase() will pick. Constant
// since the SQLite driver was removed, but kept as a function so schema-sync
// call sites stay explicit about where the dialect comes from.
export function getDriverType(): 'postgresql' {
  return 'postgresql';
}

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (_singleton.instance) return _singleton.instance;

  if (isPgliteEnabled()) {
    const { PgliteAdapter, createPglite } = await import('./pglite-adapter');
    const path = process.env.PGLITE_PATH ?? './.pglite-data';
    _singleton.instance = new PgliteAdapter(createPglite(path));
    if (process.env.NODE_ENV !== 'test') {
      logger.info('pglite_connected', { path });
    }
  } else if (process.env.NODE_ENV === 'test') {
    // Tests get an in-memory pglite so they never require a running server.
    // Most suites use tests/helpers/testDb.ts directly; this path covers
    // code that reaches getDatabase() itself.
    const { PgliteAdapter, createPglite } = await import('./pglite-adapter');
    _singleton.instance = new PgliteAdapter(createPglite());
  } else {
    const { PostgresAdapter } = await import('./postgres-adapter');
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    _singleton.instance = new PostgresAdapter(url);
  }

  return _singleton.instance;
}

export async function closeDatabase(): Promise<void> {
  if (_singleton.instance) {
    await _singleton.instance.close();
    _singleton.instance = null;
  }
}

// For testing: reset the singleton
export function resetDatabaseInstance(): void {
  _singleton.instance = null;
}
