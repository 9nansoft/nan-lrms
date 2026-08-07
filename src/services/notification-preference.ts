// src/services/notification-preference.ts
// Per-user MOPH LINE alert opt-in (spec 2026-08-05-notification-optin-design).
// Default OFF: absence of a row = not receiving. Self-subscribe is
// authoritative (bypasses admin lists). PDPA-safe: CID only.
import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '@/db/adapter';
import { notificationEventKeys } from '@/config/notification-events';

export interface NotificationPreference {
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
}

function rowToPref(r: {
  user_cid: string;
  hospital_code: string;
  moph_line_enabled: boolean;
}): NotificationPreference {
  return {
    userCid: r.user_cid,
    hospitalCode: r.hospital_code,
    mophLineEnabled: r.moph_line_enabled,
  };
}

export async function getNotificationPreference(
  db: DatabaseAdapter,
  userCid: string,
  hospitalCode: string,
): Promise<NotificationPreference | null> {
  const rows = await db.query<{
    user_cid: string;
    hospital_code: string;
    moph_line_enabled: boolean;
  }>(
    `SELECT user_cid, hospital_code, moph_line_enabled
     FROM notification_preferences
     WHERE user_cid = ? AND hospital_code = ?`,
    [userCid, hospitalCode],
  );
  return rows[0] ? rowToPref(rows[0]) : null;
}

export async function upsertNotificationPreference(
  db: DatabaseAdapter,
  userCid: string,
  hospitalCode: string,
  enabled: boolean,
): Promise<NotificationPreference> {
  const now = new Date().toISOString();
  const existing = await getNotificationPreference(db, userCid, hospitalCode);
  if (existing) {
    await db.execute(
      `UPDATE notification_preferences SET moph_line_enabled = ?, updated_at = ?
       WHERE user_cid = ? AND hospital_code = ?`,
      [enabled, now, userCid, hospitalCode],
    );
    return { userCid, hospitalCode, mophLineEnabled: enabled };
  }
  const { randomUUID } = await import('crypto');
  await db.execute(
    `INSERT INTO notification_preferences
       (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userCid, hospitalCode, enabled, now, now],
  );
  return { userCid, hospitalCode, mophLineEnabled: enabled };
}

export async function enabledSubscriberCids(
  db: DatabaseAdapter,
  hospitalCode: string,
): Promise<{ cid: string }[]> {
  return db.query<{ cid: string }>(
    `SELECT user_cid AS cid FROM notification_preferences
     WHERE hospital_code = ? AND moph_line_enabled = true`,
    [hospitalCode],
  );
}

/**
 * P1-D one-shot rollout backfill (codex gap-sweep): the Default-OFF flip makes
 * every currently-configured consult doctor go silent until they self-enable.
 * Seed an enabled preference row for each ACTIVE consult doctor so no one
 * silently loses alerts on deploy. Idempotent: ON CONFLICT DO NOTHING never
 * clobbers a user's later opt-out, and re-runs (startup is retried) don't
 * duplicate. Center monitors are excluded — they bypass the gate by design
 * (P1-C: admin list is authoritative).
 */
export async function backfillActiveConsultDoctorPrefs(db: DatabaseAdapter): Promise<number> {
  const now = new Date().toISOString();
  const rows = await db.query<{ cid: string; hcode: string }>(
    `SELECT d.cid, h.hcode
     FROM hospital_consult_doctors d
     JOIN hospitals h ON h.id = d.hospital_id
     WHERE d.is_active = true`,
  );
  let inserted = 0;
  for (const r of rows) {
    const { randomUUID } = await import('crypto');
    const res = await db.execute(
      `INSERT INTO notification_preferences
         (id, user_cid, hospital_code, moph_line_enabled, created_at, updated_at)
       VALUES (?, ?, ?, true, ?, ?)
       ON CONFLICT (user_cid, hospital_code) DO NOTHING`,
      [randomUUID(), r.cid, r.hcode, now, now],
    );
    // execute() returns void; the adapter exposes no rowCount here, so count a
    // conflict-skip as "not inserted" is impossible — this is advisory for a
    // startup log line only. (unknown-hop satisfies TS strict cast rule.)
    void res;
    inserted += 1;
  }
  return inserted;
}

// ---------------------------------------------------------------------------
// Multi-hospital, per-event preferences
// (spec 2026-08-07-notification-events-design)
//
// A user may watch several hospitals; each watched hospital is one
// notification_preferences row carrying its own detail level, digest hour and
// event subscription set.
// ---------------------------------------------------------------------------

export type NotificationDetailLevel = 'full' | 'aggregate';

export interface NotificationPreferenceFull {
  id: string;
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  detailLevel: NotificationDetailLevel;
  digestHour: number;
  /** ENABLED event keys. A row with no children means every event. */
  events: string[];
}

export interface SaveNotificationPreferenceInput {
  userCid: string;
  hospitalCode: string;
  mophLineEnabled: boolean;
  detailLevel: NotificationDetailLevel;
  digestHour: number;
  events: string[];
}

/**
 * Anything that is not exactly 'full' reads as 'aggregate'. Detail may only be
 * downgraded, never upgraded, so an unknown or NULL column value must fail to
 * the less-revealing level rather than be cast into a promise of 'full'.
 */
function toDetailLevel(value: string | null | undefined): NotificationDetailLevel {
  return value === 'full' ? 'full' : 'aggregate';
}

export async function listNotificationPreferences(
  db: DatabaseAdapter,
  userCid: string,
): Promise<NotificationPreferenceFull[]> {
  const rows = await db.query<{
    id: string;
    user_cid: string;
    hospital_code: string;
    moph_line_enabled: boolean;
    detail_level: string | null;
    digest_hour: number | null;
  }>(
    `SELECT id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour
     FROM notification_preferences WHERE user_cid = ? ORDER BY hospital_code`,
    [userCid],
  );
  if (rows.length === 0) return [];

  // One children query for the whole set — an N+1 here would scale with the
  // number of watched hospitals on every profile load.
  const subs = await db.query<{ preference_id: string; event_key: string; enabled: boolean }>(
    `SELECT preference_id, event_key, enabled
       FROM notification_event_subscriptions
      WHERE preference_id IN (${rows.map(() => '?').join(', ')})
      ORDER BY event_key`,
    rows.map((r) => r.id),
  );
  const byPreference = new Map<string, { event_key: string; enabled: boolean }[]>();
  for (const s of subs) {
    const list = byPreference.get(s.preference_id);
    if (list) list.push(s);
    else byPreference.set(s.preference_id, [s]);
  }

  return rows.map((r) => {
    const children = byPreference.get(r.id) ?? [];
    // Back-compat: no children = subscribed to everything. Without this a
    // pre-migration row would silently stop delivering.
    const events =
      children.length === 0
        ? notificationEventKeys()
        : children.filter((s) => s.enabled).map((s) => s.event_key);
    return {
      id: r.id,
      userCid: r.user_cid,
      hospitalCode: r.hospital_code,
      mophLineEnabled: r.moph_line_enabled,
      detailLevel: toDetailLevel(r.detail_level),
      digestHour: Number(r.digest_hour ?? 8),
      events,
    };
  });
}

export async function saveNotificationPreference(
  db: DatabaseAdapter,
  input: SaveNotificationPreferenceInput,
): Promise<NotificationPreferenceFull> {
  const now = new Date().toISOString();
  // One transaction: clearing the event set and rewriting it must be atomic.
  // Between the DELETE and the INSERTs the row has zero children, which the
  // back-compat rule reads as "subscribed to EVERY event" — so a crash or a
  // concurrent read in that window would re-subscribe the user to alerts they
  // just opted out of.
  await db.transaction(async (tx) => {
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM notification_preferences WHERE user_cid = ? AND hospital_code = ?`,
      [input.userCid, input.hospitalCode],
    );
    const id = existing[0]?.id ?? randomUUID();
    if (existing[0]) {
      await tx.execute(
        `UPDATE notification_preferences
         SET moph_line_enabled = ?, detail_level = ?, digest_hour = ?, updated_at = ?
         WHERE id = ?`,
        [input.mophLineEnabled, input.detailLevel, input.digestHour, now, id],
      );
    } else {
      await tx.execute(
        `INSERT INTO notification_preferences
           (id, user_cid, hospital_code, moph_line_enabled, detail_level, digest_hour, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.userCid,
          input.hospitalCode,
          input.mophLineEnabled,
          input.detailLevel,
          input.digestHour,
          now,
          now,
        ],
      );
    }

    // Replace the event set wholesale — a partial update would leave stale rows
    // that read as "still subscribed".
    await tx.execute(`DELETE FROM notification_event_subscriptions WHERE preference_id = ?`, [id]);
    // One child per catalog event, enabled or not. Writing the disabled ones
    // too is what keeps "saved with every box unchecked" distinguishable from
    // "never saved" — the latter is the zero-children back-compat case meaning
    // ALL events, so a user who opted out of everything would otherwise get
    // everything. Unknown keys are absent from the catalog and so never stored.
    const wanted = new Set(input.events);
    for (const key of notificationEventKeys()) {
      await tx.execute(
        `INSERT INTO notification_event_subscriptions
           (id, preference_id, event_key, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), id, key, wanted.has(key), now, now],
      );
    }
  });

  const saved = (await listNotificationPreferences(db, input.userCid)).find(
    (p) => p.hospitalCode === input.hospitalCode,
  );
  if (!saved) {
    throw new Error(
      `บันทึกการตั้งค่าแจ้งเตือนของโรงพยาบาล ${input.hospitalCode} ไม่สำเร็จ — กรุณาลองใหม่อีกครั้ง`,
    );
  }
  return saved;
}

export async function removeNotificationPreference(
  db: DatabaseAdapter,
  userCid: string,
  hospitalCode: string,
): Promise<void> {
  // Atomic for the same reason as saving: a parent left behind without its
  // children reads as "subscribed to every event".
  await db.transaction(async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `SELECT id FROM notification_preferences WHERE user_cid = ? AND hospital_code = ?`,
      [userCid, hospitalCode],
    );
    if (!rows[0]) return;
    await tx.execute(`DELETE FROM notification_event_subscriptions WHERE preference_id = ?`, [
      rows[0].id,
    ]);
    await tx.execute(`DELETE FROM notification_preferences WHERE id = ?`, [rows[0].id]);
  });
}

/**
 * CIDs subscribed to one event at one hospital, with the detail level to render
 * for each. A preference row with NO event children counts as subscribed (the
 * back-compat rule) — expressed as a NOT EXISTS branch so it stays one query.
 */
export async function subscribersForEvent(
  db: DatabaseAdapter,
  hospitalCode: string,
  eventKey: string,
): Promise<{ cid: string; detailLevel: NotificationDetailLevel }[]> {
  const rows = await db.query<{ user_cid: string; detail_level: string | null }>(
    `SELECT p.user_cid, p.detail_level
       FROM notification_preferences p
      WHERE p.hospital_code = ?
        AND p.moph_line_enabled = true
        AND (
          EXISTS (
            SELECT 1 FROM notification_event_subscriptions s
             WHERE s.preference_id = p.id AND s.event_key = ? AND s.enabled = true
          )
          OR NOT EXISTS (
            SELECT 1 FROM notification_event_subscriptions s2 WHERE s2.preference_id = p.id
          )
        )
      ORDER BY p.user_cid`,
    [hospitalCode, eventKey],
  );
  return rows.map((r) => ({
    cid: r.user_cid,
    detailLevel: toDetailLevel(r.detail_level),
  }));
}
