// src/services/notification-preference.ts
// Per-user MOPH LINE alert opt-in (spec 2026-08-05-notification-optin-design).
// Default OFF: absence of a row = not receiving. Self-subscribe is
// authoritative (bypasses admin lists). PDPA-safe: CID only.
import type { DatabaseAdapter } from '@/db/adapter';

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
