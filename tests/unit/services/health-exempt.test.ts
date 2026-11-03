import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { PgliteAdapter } from '@/db/pglite-adapter';
import { getHealthStatus } from '@/services/health';

describe('health excludes pseudo-hospitals (EXEMPT_HCODES)', () => {
  let db: PgliteAdapter;
  beforeEach(async () => {
    db = await createTestDb();
    const fresh = new Date(Date.now() - 5 * 60_000).toISOString();
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString();
    for (const [id, hcode, last] of [
      ['h1', '11000', fresh],
      ['h99', '99999', old], // Provincial Admin — never a real feed
      ['h0', '00000', null],
    ] as const) {
      await db.query(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, last_sync_at, created_at, updated_at)
         VALUES (?, ?, ?, 'A_S', true, 'ONLINE', ?, NOW(), NOW())`,
        [id, hcode, `รพ.${hcode}`, last],
      );
    }
  });

  it('counts only reporting hospitals and is not degraded by 99999/00000', async () => {
    const h = await getHealthStatus(db);
    expect(h.hospitalConnections.total).toBe(1);
    expect(h.hospitalConnections.stale).toBe(0);
    expect(h.degradedReasons).not.toContain('hospital_sync_stale');
  });
});
