import { describe, it, expect } from 'vitest';
import { createPgliteDb } from '../helpers/createPgliteDb';

describe('createPgliteDb', () => {
  it('creates an in-memory pglite db with all production tables', async () => {
    const db = await createPgliteDb();
    const tables = await db.getTableNames();
    expect(tables).toContain('hospitals');
    expect(tables).toContain('cached_patients');
    expect(tables).toContain('cached_partograph_observations');
    await db.close();
  });

  it('uses ? placeholder rewrite end-to-end', async () => {
    const db = await createPgliteDb();
    // hospitals.updated_at is NOT NULL with no default in the production
    // schema — SQLite is permissive here, postgres is strict, so the
    // harness must include it.
    const now = new Date().toISOString();
    await db.execute(
      'INSERT INTO hospitals (id, hcode, name, level, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      ['h-1', '10670', 'Test', 'M2', now, now],
    );
    const rows = await db.query('SELECT hcode FROM hospitals WHERE id = ?', ['h-1']);
    expect(rows).toHaveLength(1);
    await db.close();
  });
});
