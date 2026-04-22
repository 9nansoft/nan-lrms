// T023: Connection factory — NODE_ENV-based routing

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

// Named without the `use` prefix on purpose — eslint react-hooks rules
// would otherwise flag every caller as misusing a React Hook.
export function isSqliteEnabled(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.USE_SQLITE === 'true';
}

// In-process Postgres dev mode via @electric-sql/pglite. Useful when you
// want real Postgres dialect without standing up a server. Persists to a
// local directory so data survives restarts.
export function isPgliteEnabled(): boolean {
  return process.env.USE_PGLITE === 'true';
}

export async function getDatabase(): Promise<DatabaseAdapter> {
  if (_singleton.instance) return _singleton.instance;

  if (isPgliteEnabled()) {
    const { PgliteAdapter } = await import('./pglite-adapter');
    const { PGlite } = await import('@electric-sql/pglite');
    const path = process.env.PGLITE_PATH ?? './.pglite-data';
    _singleton.instance = new PgliteAdapter(new PGlite(path));
    if (process.env.NODE_ENV !== 'test') {
      logger.info('pglite_connected', { path });
    }
  } else if (isSqliteEnabled()) {
    const { SqliteAdapter } = await import('./sqlite-adapter');
    const path = process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.SQLITE_PATH ?? 'dev.sqlite');
    _singleton.instance = new SqliteAdapter(path);
    if (process.env.NODE_ENV !== 'test') {
      logger.info('sqlite_connected', { path });
    }
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
