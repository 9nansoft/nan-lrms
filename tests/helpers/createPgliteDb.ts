// Test harness: spin up an in-memory pglite database with the production
// schema applied, so integration tests can exercise the real PostgreSQL
// dialect (information_schema, $N placeholders, JSONB) without an external
// server. Mirrors the production startup sequence in src/app/api/startup.ts:
// connect adapter → SchemaSync.sync(db, ALL_TABLES, 'postgresql').
//
// Usage:
//   const db = await createPgliteDb();
//   try { ...test... } finally { await db.close(); }

import { PGlite } from '@electric-sql/pglite';
import { PgliteAdapter } from '@/db/pglite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables/index';

export async function createPgliteDb(): Promise<PgliteAdapter> {
  const adapter = new PgliteAdapter(new PGlite());
  await SchemaSync.sync(adapter, ALL_TABLES, 'postgresql');
  return adapter;
}
