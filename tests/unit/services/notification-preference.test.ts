// tests/unit/services/notification-preference.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { DatabaseAdapter } from '@/db/adapter';
import type { ColumnInfo } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import {
  getNotificationPreference,
  upsertNotificationPreference,
  enabledSubscriberCids,
  backfillActiveConsultDoctorPrefs,
  listNotificationPreferences,
  saveNotificationPreference,
  removeNotificationPreference,
  subscribersForEvent,
} from '@/services/notification-preference';
import { implementedNotificationEvents } from '@/config/notification-events';

let db: DatabaseAdapter;
process.env.ENCRYPTION_KEY = generateKey();

/**
 * Delegates everything to a real adapter, but makes the Nth execute() *inside a
 * transaction* throw. Lets a test assert that a half-applied save rolls back
 * instead of leaving the preference row with zero event children — the state
 * that reads as "subscribed to everything".
 */
class FailingExecuteAdapter extends DatabaseAdapter {
  private executes = 0;

  constructor(
    private readonly inner: DatabaseAdapter,
    private readonly failOnExecute: number,
  ) {
    super();
  }

  async execute(sql: string, params?: unknown[]): Promise<void> {
    this.executes += 1;
    if (this.executes === this.failOnExecute) throw new Error('simulated DB failure');
    return this.inner.execute(sql, params);
  }

  async query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
    return this.inner.query<T>(sql, params);
  }

  async getTableNames(): Promise<string[]> {
    return this.inner.getTableNames();
  }

  async getColumnInfo(table: string): Promise<ColumnInfo[]> {
    return this.inner.getColumnInfo(table);
  }

  async transaction<T>(fn: (adapter: DatabaseAdapter) => Promise<T>): Promise<T> {
    // Count from zero inside the transaction so `failOnExecute` indexes the
    // statements the service issues between BEGIN and COMMIT.
    return this.inner.transaction((tx) => fn(new FailingExecuteAdapter(tx, this.failOnExecute)));
  }

  async close(): Promise<void> {}
}

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

  describe('backfillActiveConsultDoctorPrefs (P1-D rollout)', () => {
    async function seedAdminLists() {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, created_at, updated_at)
         VALUES ('h1', '10670', 'รพ.ทดสอบ', 'M2', true, ?, ?)`,
        [now, now],
      );
      // one active + one inactive consult doctor
      await db.execute(
        `INSERT INTO hospital_consult_doctors (id, hospital_id, cid, name, position, is_active, created_at, updated_at)
         VALUES ('d1', 'h1', '3320500282121', 'นพ. ก', 'สูติ', true, ?, ?),
                ('d2', 'h1', '3320500282122', 'นพ. ข', 'สูติ', false, ?, ?)`,
        [now, now, now, now],
      );
    }

    it('creates enabled prefs for ALL active consult doctors only, keyed by hcode', async () => {
      await seedAdminLists();
      await backfillActiveConsultDoctorPrefs(db);
      const rows = await db.query<{ user_cid: string; hospital_code: string; enabled: boolean }>(
        `SELECT user_cid, hospital_code, moph_line_enabled AS enabled
         FROM notification_preferences ORDER BY user_cid`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        user_cid: '3320500282121',
        hospital_code: '10670',
        enabled: true,
      });
    });

    it('is idempotent: re-run does not duplicate, and never clobbers a user opt-out', async () => {
      await seedAdminLists();
      // simulate a user who toggled OFF after the backfill
      await db.execute(
        `INSERT INTO notification_preferences (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
         VALUES ('u1', '3320500282121', '10670', false, NOW(), NOW())`,
      );
      await backfillActiveConsultDoctorPrefs(db);
      await backfillActiveConsultDoctorPrefs(db); // second pass
      const rows = await db.query<{ user_cid: string; moph_line_enabled: boolean }>(
        `SELECT user_cid, moph_line_enabled FROM notification_preferences`,
      );
      // user's opt-out preserved; still only 1 row (no dupes)
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ user_cid: '3320500282121', moph_line_enabled: false });
    });
  });

  describe('multi-hospital, per-event preferences', () => {
    it('saves one row per watched hospital and lists them all', async () => {
      await saveNotificationPreference(db, {
        userCid: '3320500282121',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      await saveNotificationPreference(db, {
        userCid: '3320500282121',
        hospitalCode: '11002',
        mophLineEnabled: true,
        detailLevel: 'aggregate',
        digestHour: 8,
        events: ['anc_hr3', 'maternal_triage'],
      });
      const prefs = await listNotificationPreferences(db, '3320500282121');
      expect(prefs.map((p) => p.hospitalCode).sort()).toEqual(['10670', '11002']);
      expect(prefs.find((p) => p.hospitalCode === '10670')?.events).toEqual(['anc_hr3']);
    });

    it('treats a row with NO event children as subscribed to everything', async () => {
      // Simulates a pre-migration row.
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO notification_preferences
           (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
         VALUES ('legacy', '3320500282199', '10670', true, ?, ?)`,
        [now, now],
      );
      // …but only to events that can actually FIRE. Expanding to the full
      // catalog would round-trip through the UI and be saved back as explicit
      // opt-ins for events the user was never shown a checkbox for, so they
      // would silently start receiving Phase-2 events on the day those ship.
      const prefs = await listNotificationPreferences(db, '3320500282199');
      expect(prefs[0].events).toEqual(implementedNotificationEvents().map((e) => e.key));
      expect(prefs[0].events).not.toContain('partograph_critical');
      // Delivery for the events that exist today is unaffected.
      const subs = await subscribersForEvent(db, '10670', 'anc_hr3');
      expect(subs.map((s) => s.cid)).toContain('3320500282199');
    });

    it('a legacy row round-tripped through the UI does not gain unimplemented events', async () => {
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO notification_preferences
           (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
         VALUES ('legacy2', '3320500282198', '10670', true, ?, ?)`,
        [now, now],
      );
      // What the card would send back after the user touches one checkbox.
      const listed = await listNotificationPreferences(db, '3320500282198');
      await saveNotificationPreference(db, {
        userCid: '3320500282198',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: listed[0].events,
      });
      const rows = await db.query<{ event_key: string; enabled: boolean }>(
        `SELECT s.event_key, s.enabled FROM notification_event_subscriptions s
         JOIN notification_preferences p ON p.id = s.preference_id
         WHERE p.user_cid = '3320500282198' AND s.enabled = true`,
      );
      expect(rows.map((r) => r.event_key).sort()).toEqual(['anc_hr3', 'maternal_triage']);
    });

    it('returns only subscribers of the requested event, with their detail level', async () => {
      await saveNotificationPreference(db, {
        userCid: '3320500282121',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      await saveNotificationPreference(db, {
        userCid: '3320500282122',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'aggregate',
        digestHour: 8,
        events: ['maternal_triage'],
      });
      const anc = await subscribersForEvent(db, '10670', 'anc_hr3');
      expect(anc).toEqual([{ cid: '3320500282121', detailLevel: 'full' }]);
    });

    it('a muted row (moph_line_enabled=false) subscribes to nothing', async () => {
      await saveNotificationPreference(db, {
        userCid: '3320500282123',
        hospitalCode: '10670',
        mophLineEnabled: false,
        detailLevel: 'full',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      const subs = await subscribersForEvent(db, '10670', 'anc_hr3');
      expect(subs.map((s) => s.cid)).not.toContain('3320500282123');
    });

    it('re-saving replaces the event set rather than accumulating', async () => {
      const base = {
        userCid: '3320500282124',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full' as const,
        digestHour: 8,
      };
      await saveNotificationPreference(db, { ...base, events: ['anc_hr3', 'maternal_triage'] });
      await saveNotificationPreference(db, { ...base, events: ['maternal_triage'] });
      const prefs = await listNotificationPreferences(db, '3320500282124');
      expect(prefs[0].events).toEqual(['maternal_triage']);
    });

    it('removing a watched hospital deletes its subscriptions too', async () => {
      await saveNotificationPreference(db, {
        userCid: '3320500282125',
        hospitalCode: '11002',
        mophLineEnabled: true,
        detailLevel: 'aggregate',
        digestHour: 8,
        events: ['anc_hr3'],
      });
      await removeNotificationPreference(db, '3320500282125', '11002');
      expect(await listNotificationPreferences(db, '3320500282125')).toHaveLength(0);
      const orphans = await db.query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM notification_event_subscriptions`,
      );
      expect(Number(orphans[0].c)).toBe(0);
    });

    it('drops unknown event keys instead of storing them', async () => {
      const saved = await saveNotificationPreference(db, {
        userCid: '3320500282126',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: ['anc_hr3', 'not_a_real_event'],
      });
      expect(saved.events).toEqual(['anc_hr3']);
      const subs = await subscribersForEvent(db, '10670', 'not_a_real_event');
      expect(subs.map((s) => s.cid)).not.toContain('3320500282126');
    });

    it('an explicitly empty event set is NOT the back-compat "all events" case', async () => {
      // A user who unchecks every box must receive nothing. Distinguishing this
      // from a pre-migration row is the whole point of the disabled-child row.
      await saveNotificationPreference(db, {
        userCid: '3320500282127',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full',
        digestHour: 8,
        events: [],
      });
      const prefs = await listNotificationPreferences(db, '3320500282127');
      expect(prefs[0].events).toEqual([]);
      const subs = await subscribersForEvent(db, '10670', 'anc_hr3');
      expect(subs.map((s) => s.cid)).not.toContain('3320500282127');
    });

    it('rolls a half-applied save back rather than leaving a zero-children row', async () => {
      // Zero children means "every event", so a save that clears the old set
      // and then dies mid-insert would silently re-subscribe the user to
      // everything they just opted out of.
      const base = {
        userCid: '3320500282128',
        hospitalCode: '10670',
        mophLineEnabled: true,
        detailLevel: 'full' as const,
        digestHour: 8,
      };
      await saveNotificationPreference(db, { ...base, events: ['anc_hr3'] });

      // 1 = UPDATE parent, 2 = DELETE children, 3 = first INSERT. Failing on 3
      // is the worst case: the old set is gone and nothing has replaced it.
      const flaky = new FailingExecuteAdapter(db, 3);
      await expect(
        saveNotificationPreference(flaky, { ...base, events: ['maternal_triage'] }),
      ).rejects.toThrow('simulated DB failure');

      const prefs = await listNotificationPreferences(db, '3320500282128');
      expect(prefs[0].events).toEqual(['anc_hr3']);
      const triage = await subscribersForEvent(db, '10670', 'maternal_triage');
      expect(triage.map((s) => s.cid)).not.toContain('3320500282128');
    });
  });
});
