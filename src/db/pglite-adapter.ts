// T2: PgliteAdapter — in-process PostgreSQL via pglite for integration tests.
// Mirrors PostgresAdapter's behaviour so tests can exercise the real
// PostgreSQL dialect (information_schema, $N placeholders) without spinning
// up an external server. The codebase canonicalises on `?` placeholders, so
// this adapter rewrites them to `$N` before handing the query to pglite.

import type { PGlite, Transaction as PgliteTransaction } from '@electric-sql/pglite';
import { DatabaseAdapter, type ColumnInfo } from './adapter';

function rewritePlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// Minimal surface of pglite/Transaction we use — query() with text + params.
interface PgliteQueryRunner {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export class PgliteAdapter extends DatabaseAdapter {
  constructor(private pg: PGlite) {
    super();
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.pg.query(rewritePlaceholders(sql), params);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const result = await this.pg.query<T>(rewritePlaceholders(sql), params);
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
    return this.pg.transaction(async (tx) => {
      const txAdapter = new PgliteTransactionAdapter(tx);
      return fn(txAdapter);
    });
  }

  async close(): Promise<void> {
    await this.pg.close();
  }
}

// Transactional adapter — uses the pglite Transaction handle so all writes
// participate in the surrounding BEGIN/COMMIT.
class PgliteTransactionAdapter extends DatabaseAdapter {
  constructor(private tx: PgliteQueryRunner & PgliteTransaction) {
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
