// In-app alert notifications — unified read/mark-read view over the MOPH alert
// pipeline (moph_alert_log + moph_alert_event_queue).
//
// Every clinical/system alert that notifies via BMS or LINE OA หมอพร้อม
// (anc_hr3, maternal_triage, partograph_critical, cpd_high, referral_incoming,
// referral_overdue, consult_message, maternity_assessment) lands in
// moph_alert_log (when LINE recipients exist) or moph_alert_event_queue (when
// no LINE recipient is configured yet for that hospital). This service exposes
// those exact alerts to the web header's notification bell badge and viewer.
import type { DatabaseAdapter } from '@/db/adapter';
import { decryptSafe } from '@/lib/encryption';
import { findNotificationEvent } from '@/config/notification-events';
import {
  buildAlertMessage,
  type AlertRecipientScope,
  type AlertSeverity,
} from '@/config/moph-alert-templates';

export interface InAppAlertViewer {
  userCid: string | null;
  hospitalId: string | null;
  limit?: number;
}

export interface InAppAlertItem {
  id: string;
  caseId: string;
  hospitalId: string;
  originHcode: string;
  hospitalName: string;
  alertSource: string;
  eventLabelTh: string;
  severity: AlertSeverity;
  title: string;
  messageText: string;
  patientName: string | null;
  confirmUrl: string | null;
  /** BMS / LINE OA หมอพร้อม delivery state. */
  lineStatus: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface InAppAlertsListResult {
  alerts: InAppAlertItem[];
  unreadCount: number;
}

interface RawAlertRow {
  id: string;
  source_table: 'log' | 'queue';
  case_id: string;
  hospital_id: string;
  origin_hcode: string;
  hospital_name: string | null;
  recipient_cid: string | null;
  recipient_scope: string;
  detail_level: string | null;
  alert_source: string;
  severity: string;
  rule_id: string;
  title: string;
  patient_name_enc: string | null;
  confirm_url: string | null;
  local_date: string;
  status: string;
  read_at: string | Date | null;
  created_at: string | Date;
}

function toIso(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function resolveConfirmUrl(
  confirmUrl: string | null,
  originHcode: string,
  caseId: string,
): string | null {
  if (confirmUrl && confirmUrl.trim()) return confirmUrl.trim();
  const anMatch = /^AN\s+([^\s(]+)/i.exec(caseId.trim());
  if (anMatch && originHcode) {
    return `/patients/${originHcode}-${anMatch[1]}`;
  }
  return null;
}

function normalizeSeverity(raw: string): AlertSeverity {
  if (raw === 'emergency' || raw === 'notify') return raw;
  return 'high';
}

function normalizeScope(raw: string): AlertRecipientScope {
  if (raw === 'province_center' || raw === 'self_subscribed') return raw;
  return 'hospital_staff';
}

/**
 * List recent in-app alert notifications for the signed-in user (by CID and/or
 * own hospital), newest first, along with the unread count.
 */
export async function listInAppAlerts(
  db: DatabaseAdapter,
  viewer: InAppAlertViewer,
): Promise<InAppAlertsListResult> {
  const cid = (viewer.userCid ?? '').trim();
  const hospitalId = (viewer.hospitalId ?? '').trim();
  if (!cid && !hospitalId) {
    return { alerts: [], unreadCount: 0 };
  }

  const maxRows = Math.max(1, Math.min(Math.trunc(viewer.limit ?? 50), 200));

  const logConditions: string[] = [];
  const logParams: unknown[] = [];
  if (cid && hospitalId) {
    // For point-to-point consult notifications (`consult_message`),
    // `hospital_id` is ALWAYS the receiving hospital. Require `hospital_id = ?`
    // for `consult_message` when the viewer belongs to a hospital so an
    // outgoing consult sent FROM รพ.แม่ข่าย TO รพช. only lights up the badge at
    // รพช. (the receiver) and never echoes back on รพ.แม่ข่าย's badge.
    logConditions.push("(recipient_cid = ? AND (alert_source <> 'consult_message' OR hospital_id = ?))");
    logParams.push(cid, hospitalId);
    logConditions.push('hospital_id = ?');
    logParams.push(hospitalId);
  } else if (cid) {
    logConditions.push('recipient_cid = ?');
    logParams.push(cid);
  } else if (hospitalId) {
    logConditions.push('hospital_id = ?');
    logParams.push(hospitalId);
  }

  const logRows = await db.query<RawAlertRow>(
    `SELECT id, 'log' AS source_table, case_id, hospital_id, origin_hcode,
            hospital_name, recipient_cid, recipient_scope, detail_level,
            alert_source, severity, rule_id, title, patient_name_enc,
            confirm_url, local_date, status, read_at, created_at
       FROM moph_alert_log
      WHERE (${logConditions.join(' OR ')})
      ORDER BY created_at DESC
      LIMIT ${maxRows * 3}`,
    logParams,
  );

  const queueRows = hospitalId
    ? await db.query<RawAlertRow>(
        `SELECT id, 'queue' AS source_table, case_id, hospital_id, origin_hcode,
                hospital_name, NULL AS recipient_cid, 'hospital_staff' AS recipient_scope,
                'full' AS detail_level, alert_source, severity, rule_id, title,
                patient_name_enc, confirm_url, local_date, status, read_at, created_at
           FROM moph_alert_event_queue
          WHERE hospital_id = ? AND status = 'awaiting_recipients'
          ORDER BY created_at DESC
          LIMIT ${maxRows}`,
        [hospitalId],
      )
    : [];

  // Deduplicate by event identity (case_id, hospital_id, alert_source, severity, rule_id, local_date).
  // Prefer the row addressed directly to viewer.userCid so their own read_at and delivery status win.
  const byEventKey = new Map<string, RawAlertRow>();
  for (const row of [...logRows, ...queueRows]) {
    const eventKey = `${row.case_id}|${row.hospital_id}|${row.alert_source}|${row.severity}|${row.rule_id}|${row.local_date}`;
    const existing = byEventKey.get(eventKey);
    if (!existing) {
      byEventKey.set(eventKey, row);
      continue;
    }
    const rowMatchesCid = Boolean(cid && row.recipient_cid === cid);
    const existingMatchesCid = Boolean(cid && existing.recipient_cid === cid);
    if (rowMatchesCid && !existingMatchesCid) {
      byEventKey.set(eventKey, row);
    }
  }

  const sorted = [...byEventKey.values()]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, maxRows);

  const alerts: InAppAlertItem[] = sorted.map((row) => {
    const severity = normalizeSeverity(row.severity);
    const scope = normalizeScope(row.recipient_scope);
    const isOwnHospital = Boolean(hospitalId && row.hospital_id === hospitalId);
    const detailLevel: 'full' | 'aggregate' =
      row.detail_level === 'full' || isOwnHospital ? 'full' : 'aggregate';
    const hospitalName = row.hospital_name?.trim() || row.origin_hcode;
    const canSeePatientName =
      detailLevel === 'full' && (scope === 'hospital_staff' || isOwnHospital);
    const patientName = canSeePatientName ? decryptSafe(row.patient_name_enc) : null;
    const confirmUrl = resolveConfirmUrl(row.confirm_url, row.origin_hcode, row.case_id);
    const { text: messageText } = buildAlertMessage({
      severity,
      recipientScope: canSeePatientName ? 'hospital_staff' : scope,
      detailLevel,
      hospitalName,
      caseRef: row.case_id,
      patientName,
      confirmUrl,
    });
    const eventMeta = findNotificationEvent(row.alert_source);
    const readAtIso = toIso(row.read_at);

    return {
      id: row.id,
      caseId: row.case_id,
      hospitalId: row.hospital_id,
      originHcode: row.origin_hcode,
      hospitalName,
      alertSource: row.alert_source,
      eventLabelTh: eventMeta?.labelTh ?? row.alert_source,
      severity,
      title: row.title,
      messageText,
      patientName,
      confirmUrl,
      lineStatus: row.status,
      isRead: readAtIso !== null,
      readAt: readAtIso,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    };
  });

  const unreadCount = alerts.filter((a) => !a.isRead).length;
  return { alerts, unreadCount };
}

/**
 * Mark one notification (and any sibling recipient rows of the same event for
 * this viewer/hospital) or all notifications for this viewer as read.
 */
export async function markInAppAlertsRead(
  db: DatabaseAdapter,
  viewer: InAppAlertViewer,
  input: { id?: string | null; markAll?: boolean },
): Promise<number> {
  const cid = (viewer.userCid ?? '').trim();
  const hospitalId = (viewer.hospitalId ?? '').trim();
  if (!cid && !hospitalId) return 0;

  const now = new Date().toISOString();
  const targetId = (input.id ?? '').trim();

  if (input.markAll || !targetId) {
    if (cid && hospitalId) {
      await db.execute(
        `UPDATE moph_alert_log
            SET read_at = ?, updated_at = ?
          WHERE (recipient_cid = ? OR hospital_id = ?) AND read_at IS NULL`,
        [now, now, cid, hospitalId],
      );
    } else if (cid) {
      await db.execute(
        `UPDATE moph_alert_log
            SET read_at = ?, updated_at = ?
          WHERE recipient_cid = ? AND read_at IS NULL`,
        [now, now, cid],
      );
    } else if (hospitalId) {
      await db.execute(
        `UPDATE moph_alert_log
            SET read_at = ?, updated_at = ?
          WHERE hospital_id = ? AND read_at IS NULL`,
        [now, now, hospitalId],
      );
    }
    if (hospitalId) {
      await db.execute(
        `UPDATE moph_alert_event_queue
            SET read_at = ?, updated_at = ?
          WHERE hospital_id = ? AND read_at IS NULL`,
        [now, now, hospitalId],
      );
    }
  } else {
    // Find the event identity of `targetId` in either table so marking it read
    // also marks sibling rows of the same event for this viewer/hospital.
    const logMatch = await db.query<{
      case_id: string;
      hospital_id: string;
      alert_source: string;
      rule_id: string;
      local_date: string;
    }>(
      `SELECT case_id, hospital_id, alert_source, rule_id, local_date
         FROM moph_alert_log
        WHERE id = ?
        LIMIT 1`,
      [targetId],
    );
    if (logMatch[0]) {
      const m = logMatch[0];
      const allowed =
        (hospitalId && m.hospital_id === hospitalId) || Boolean(cid);
      if (allowed) {
        await db.execute(
          `UPDATE moph_alert_log
              SET read_at = ?, updated_at = ?
            WHERE case_id = ? AND hospital_id = ? AND alert_source = ?
              AND rule_id = ? AND local_date = ? AND read_at IS NULL`,
          [now, now, m.case_id, m.hospital_id, m.alert_source, m.rule_id, m.local_date],
        );
      }
    } else if (hospitalId) {
      await db.execute(
        `UPDATE moph_alert_event_queue
            SET read_at = ?, updated_at = ?
          WHERE id = ? AND hospital_id = ? AND read_at IS NULL`,
        [now, now, targetId, hospitalId],
      );
    }
  }

  const after = await listInAppAlerts(db, viewer);
  return after.unreadCount;
}
