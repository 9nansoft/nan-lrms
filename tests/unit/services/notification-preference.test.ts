// tests/unit/services/notification-preference.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import {
  getNotificationPreference,
  upsertNotificationPreference,
  enabledSubscriberCids,
} from '@/services/notification-preference';

let db: DatabaseAdapter;
process.env.ENCRYPTION_KEY = generateKey();

describe('notification-preference service', () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.close?.();
  });

  it('get returns null when no row (Default OFF)', async () => {
    const p = await getNotificationPreference(db, '3320500282121', '10670');
    expect(p).toBeNull();
  });

  it('upsert creates then updates the row (idempotent by (cid,hcode))', async () => {
    const created = await upsertNotificationPreference(db, '3320500282121', '10670', true);
    expect(created.mophLineEnabled).toBe(true);
    const updated = await upsertNotificationPreference(db, '3320500282121', '10670', false);
    expect(updated.mophLineEnabled).toBe(false);
    const rows = await db.query<{ user_cid: string }>(
      `SELECT user_cid FROM notification_preferences WHERE user_cid = ?`,
      ['3320500282121'],
    );
    expect(rows).toHaveLength(1);
  });

  it('enabledSubscriberCids returns only enabled rows for the hospital', async () => {
    await upsertNotificationPreference(db, '3320500282121', '10670', true);
    await upsertNotificationPreference(db, '1111111111112', '10670', false);
    await upsertNotificationPreference(db, '3333333333334', '99999', true); // other hospital
    const cids = await enabledSubscriberCids(db, '10670');
    expect(cids.map((c) => c.cid)).toEqual(['3320500282121']);
  });
});
