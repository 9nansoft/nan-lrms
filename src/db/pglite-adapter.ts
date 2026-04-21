// T2: PgliteAdapter — in-process PostgreSQL via pglite for integration tests.
// Mirrors PostgresAdapter's behaviour so tests can exercise the real
// PostgreSQL dialect (information_schema, $N placeholders) without spinning
// up an external server. The codebase canonicalises on `?` placeholders, so
// this adapter rewrites them to `$N` before handing the query to pglite.

import type { PGlite, Transaction as PgliteTransaction } from '@electric-sql/pglite';
import { DatabaseAdapter, type ColumnInfo } from './adapter';

/** Thrown when PGlite's WASM runtime has aborted and cannot serve further
 *  queries. Callers should surface this in the UI as "DB unavailable" rather
 *  than treating it as an empty result. */
export class DatabaseUnavailableError extends Error {
  readonly code = 'DATABASE_UNAVAILABLE';
  constructor(reason: string, cause?: unknown) {
    super(`database unavailable: ${reason}`);
    this.name = 'DatabaseUnavailableError';
    if (cause) (this as unknown as { cause: unknown }).cause = cause;
  }
}

// Naive `?` -> `$N` rewrite. Unsafe for `?` inside string literals
// (e.g. `WHERE note = 'why?'`) and jsonb operators (`?`, `?|`, `?&`).
// Today's queries don't hit those; revisit if a jsonb query lands.
function rewritePlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export class PgliteAdapter extends DatabaseAdapter {
  // PGlite runs in a single-threaded WASM runtime. When many concurrent
  // callers hit `.query()` simultaneously (e.g. 26 simulator workers all
  // POSTing to the webhook endpoint at once), the internal state can abort
  // with "RuntimeError: Aborted()" — the classic Emscripten panic. We
  // serialize every public call through this promise chain so only one
  // query is in-flight against the WASM module at any moment.
  //
  // In production we use real Postgres via PostgresAdapter (no WASM), so
  // this serialization is only the dev-path bottleneck.
  private writeLock: Promise<unknown> = Promise.resolve();
  /** Set to true once the WASM runtime aborts. After this, every call throws
   *  a clean DatabaseUnavailableError so callers (API routes, health check)
   *  can surface the condition in the UI instead of silently returning []. */
  private aborted = false;
  private async serialized<T>(fn: () => Promise<T>): Promise<T> {
    if (this.aborted) {
      throw new DatabaseUnavailableError('pglite_wasm_aborted');
    }
    const prev = this.writeLock;
    let release: () => void = () => {};
    this.writeLock = new Promise<void>((r) => { release = r; });
    try {
      await prev;
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/Aborted\(\)|RuntimeError/.test(msg)) {
        this.aborted = true;
        // eslint-disable-next-line no-console
        console.error(
          '[pglite] WASM aborted — every subsequent DB call will reject until the server restarts.',
          '\n    cause:', msg,
        );
        throw new DatabaseUnavailableError('pglite_wasm_aborted', e);
      }
      throw e;
    } finally {
      release();
    }
  }

  /** True after the WASM instance has panicked. Exposed so the health check
   *  can report `database: 'disconnected'` without running a SELECT. */
  isDead(): boolean {
    return this.aborted;
  }

  constructor(private pg: PGlite) {
    super();
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.serialized(() => this.pg.query(rewritePlaceholders(sql), params));
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.serialized(() =>
      this.pg.query<T>(rewritePlaceholders(sql), params),
    );
    return result.rows;
  }

  async getTableNames(): Promise<string[]> {
    const result = await this.pg.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    return result.rows.map((r) => r.table_name);
  }

  async getColumnInfo(table: string): Promise<ColumnInfo[]> {
    const result = await this.pg.query<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`,
      [table],
    );
    return result.rows.map((r) => ({
      name: r.column_name,
      type: r.data_type,
      nullable: r.is_nullable === 'YES',
      defaultValue: r.column_default,
    }));
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Entire transaction owns the write-lock for its duration so nested
    // reads/writes inside `fn` don't race with concurrent callers.
    return this.serialized(() =>
      this.pg.transaction(async (tx) => {
        const txAdapter = new PgliteTransactionAdapter(tx);
        return fn(txAdapter);
      }),
    );
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

// Transactional adapter — uses the pglite Transaction handle so all writes
// participate in the surrounding BEGIN/COMMIT.
class PgliteTransactionAdapter extends DatabaseAdapter {
  constructor(private tx: PgliteTransaction) {
    super();
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.tx.query(rewritePlaceholders(sql), params);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.tx.query<T>(rewritePlaceholders(sql), params);
    return result.rows;
  }

  async getTableNames(): Promise<string[]> {
    throw new Error('getTableNames not available in transaction context');
  }

  async getColumnInfo(): Promise<ColumnInfo[]> {
    throw new Error('getColumnInfo not available in transaction context');
  }

  async transaction<T>(): Promise<T> {
    throw new Error('Nested transactions not supported');
  }

  async close(): Promise<void> {
    // No-op: transaction is committed/rolled-back by parent runner.
  }
}
