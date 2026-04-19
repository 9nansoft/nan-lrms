import { describe, it, expect, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PgliteAdapter } from '@/db/pglite-adapter';

describe('PgliteAdapter', () => {
  let adapter: PgliteAdapter;

  beforeEach(async () => {
    adapter = new PgliteAdapter(new PGlite());
    await adapter.execute(
      'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)',
    );
  });

  it('rewrites ? placeholders to $N for postgres', async () => {
    await adapter.execute('INSERT INTO t (id, name, age) VALUES (?, ?, ?)', [1, 'a', 30]);
    const rows = await adapter.query<{ id: number; name: string; age: number }>(
      'SELECT * FROM t WHERE name = ? AND age >= ?',
      ['a', 18],
    );
    expect(rows).toEqual([{ id: 1, name: 'a', age: 30 }]);
  });

  it('lists table names', async () => {
    const names = await adapter.getTableNames();
    expect(names).toContain('t');
  });

  it('reads column info', async () => {
    const cols = await adapter.getColumnInfo('t');
    expect(cols.map((c) => c.name).sort()).toEqual(['age', 'id', 'name']);
  });
});
