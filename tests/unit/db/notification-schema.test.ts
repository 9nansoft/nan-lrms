// tests/unit/db/notification-schema.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';

let db: DatabaseAdapter;

describe('notification schema', () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.close?.();
  });

  it('stores a preference with detail level and digest hour', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour, created_at, updated_at)
       VALUES ('p1', '3320500282121', '10670', true, 'full', 9, ?, ?)`,
      [now, now],
    );
    const rows = await db.query<{ detail_level: string; digest_hour: number }>(
      `SELECT detail_level, digest_hour FROM notification_preferences WHERE id = 'p1'`,
    );
    expect(rows[0].detail_level).toBe('full');
    expect(Number(rows[0].digest_hour)).toBe(9);
  });

  it('defaults detail_level to aggregate and digest_hour to 8', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('p2', '3320500282122', '11002', true, ?, ?)`,
      [now, now],
    );
    const rows = await db.query<{ detail_level: string; digest_hour: number }>(
      `SELECT detail_level, digest_hour FROM notification_preferences WHERE id = 'p2'`,
    );
    expect(rows[0].detail_level).toBe('aggregate');
    expect(Number(rows[0].digest_hour)).toBe(8);
  });

  it('rejects a duplicate event subscription for the same preference', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES ('p3', '3320500282123', '11000', true, ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO notification_event_subscriptions
         (id, preference_id, event_key, enabled, created_at, updated_at)
       VALUES ('s1', 'p3', 'anc_hr3', true, ?, ?)`,
      [now, now],
    );
    await expect(
      db.execute(
        `INSERT INTO notification_event_subscriptions
           (id, preference_id, event_key, enabled, created_at, updated_at)
         VALUES ('s2', 'p3', 'anc_hr3', false, ?, ?)`,
        [now, now],
      ),
    ).rejects.toThrow();
  });
});
