// Risk-alert enqueue orchestrator (codex #2: one orchestrator, two producers).
//
// HIGH (ANC CPD) and EMERGENCY (maternal labor-triage) producers both call
// `enqueueAlertEvent()` with a normalized event. The orchestrator:
//   1. resolves recipients — active hospital_consult_doctors (hospital_staff)
//      + active moph_center_monitors for the province (province_center);
//   2. builds a Thai Flex per recipient via moph-alert-templates (PDPA: center
//      scope gets no patient name);
//   3. writes a status='pending' moph_alert_log row per recipient, using
//      ON CONFLICT DO NOTHING on the dedup unique index (codex #5) so a repeat
//      enqueue for the same (case,recipient,source,severity,rule,day) is a no-op.
//
// NO LINE I/O happens here — the drain (moph-alert-drain.ts) is the only site
// that calls sendMophPrompt. This keeps the sync path cheap and fail-safe.

import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { mophAlertsEnabled } from '@/config/moph-alert-config';
import {
  buildAlertFlex,
  alertTitle,
  type AlertSeverity,
  type AlertRecipientScope,
} from '@/config/moph-alert-templates';

export interface AlertEventContext {
  hospitalId: string;
  originHcode: string;
  hospitalName: string;
  /** Province code (e.g. '30' Khon Kaen) — for center-monitor resolution. */
  province: string;
  /** Case/journey reference shown in the message. */
  caseRef: string;
  /** 'YYYY-MM-DD' Asia/Bangkok calendar date — part of the dedup key. */
  localDate: string;
  /** Patient name — rendered ONLY for hospital_staff scope (PDPA). */
  patientName?: string | null;
  /** Optional action-button URL. */
  confirmUrl?: string | null;
}

export interface HighRiskEventContext extends AlertEventContext {
  /** CPD score (>=10 is HIGH). Kept for audit/labeling; the caller gates on isHighRisk. */
  score: number;
}

export interface EmergencyEventContext extends AlertEventContext {
  /** Maternal-triage acuity Thai label (e.g. 'ฉุกเฉิน'). */
  acuityLabel: string;
  /** Specific EMERGENCY_ACUITY rule id — part of the dedup key so distinct
   *  emergencies on one case co-fire (codex #5). */
  ruleId: string;
}

interface Recipient {
  cid: string;
  name: string;
  scope: AlertRecipientScope;
}

const HIGH_RULE_ID = 'cpd_high';
const HIGH_ALERT_SOURCE = 'anc_cpd';
const EMERGENCY_ALERT_SOURCE = 'maternal_triage';

/** Resolve active recipients for a hospital + province. */
async function resolveRecipients(
  db: DatabaseAdapter,
  hospitalId: string,
  province: string,
): Promise<Recipient[]> {
  const staff = await db.query<{ cid: string; name: string }>(
    `SELECT cid, name FROM hospital_consult_doctors
     WHERE hospital_id = $1 AND is_active = true`,
    [hospitalId],
  );
  const center = await db.query<{ cid: string; name: string }>(
    `SELECT cid, name FROM moph_center_monitors
     WHERE province = $1 AND is_active = true`,
    [province],
  );
  return [
    ...staff.map((r) => ({ cid: r.cid, name: r.name, scope: 'hospital_staff' as const })),
    ...center.map((r) => ({ cid: r.cid, name: r.name, scope: 'province_center' as const })),
  ];
}

/**
 * Insert one pending alert row per recipient, conflict-skipping on the dedup
 * unique index. Returns the number of rows actually inserted (0 = all dupes).
 */
async function enqueueAlertEvent(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
  severity: AlertSeverity,
  alertSource: string,
  ruleId: string,
  acuityLabel?: string | null,
): Promise<number> {
  if (!mophAlertsEnabled()) {
    logger.debug('moph_alert_skipped_disabled', { caseRef: ctx.caseRef });
    return 0;
  }
  const recipients = await resolveRecipients(db, ctx.hospitalId, ctx.province);
  if (recipients.length === 0) {
    logger.warn('moph_alert_no_recipients', { hospitalId: ctx.hospitalId, caseRef: ctx.caseRef });
    return 0;
  }

  const title = alertTitle({ severity, hospitalName: ctx.hospitalName });
  let inserted = 0;
  for (const r of recipients) {
    // Flex is rebuilt by the drain from the row (severity/scope/title) so we do
    // NOT persist patient data at rest. We still build it here only to validate
    // the template path compiles against the inputs; the drain is authoritative.
    const flex = buildAlertFlex({
      severity,
      recipientScope: r.scope,
      hospitalName: ctx.hospitalName,
      caseRef: ctx.caseRef,
      patientName: r.scope === 'hospital_staff' ? ctx.patientName : null,
      acuityLabel: acuityLabel ?? null,
      confirmUrl: ctx.confirmUrl ?? null,
    });
    // ON CONFLICT DO NOTHING on the dedup unique index — repeat enqueues are
    // idempotent (codex #5).
    const result = await db.query<{ c: number }>(
      `INSERT INTO moph_alert_log
         (id, case_id, hospital_id, origin_hcode, recipient_cid, recipient_scope,
          alert_source, severity, rule_id, title, status, attempts, local_date,
          confirm_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',0,$11,$12,NOW(),NOW())
       ON CONFLICT (case_id, hospital_id, recipient_cid, alert_source, severity, rule_id, local_date)
       DO NOTHING
       RETURNING 1::int as c`,
      [
        randomUuid(),
        ctx.caseRef,
        ctx.hospitalId,
        ctx.originHcode,
        r.cid,
        r.scope,
        alertSource,
        severity,
        ruleId,
        title,
        ctx.localDate,
        ctx.confirmUrl ?? null,
      ],
    );
    if (result.length > 0) inserted++;
    void flex;
  }
  logger.info('moph_alert_enqueued', {
    caseRef: ctx.caseRef,
    severity,
    alertSource,
    ruleId,
    recipients: inserted,
  });
  return inserted;
}

/** HIGH-risk (ANC CPD) producer. Caller MUST have already gated on isHighRisk. */
export async function enqueueHighRiskAlert(
  db: DatabaseAdapter,
  ctx: HighRiskEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'high', HIGH_ALERT_SOURCE, HIGH_RULE_ID);
}

/** EMERGENCY (maternal labor-triage acuity) producer. */
export async function enqueueEmergencyAlert(
  db: DatabaseAdapter,
  ctx: EmergencyEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'emergency', EMERGENCY_ALERT_SOURCE, ctx.ruleId, ctx.acuityLabel);
}

// crypto.randomUUID is available in Node 20+; isolated here so tests/dev can
// stub if ever needed. Not using node:crypto import to keep the service
// Edge-runtime-friendly (browser-push route may run on Edge).
function randomUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const n = (Math.random() * 16) | 0;
    const v = c === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}
