// Risk-alert enqueue orchestrator (codex #2: one orchestrator, two producers).
//
// HIGH (ANC HR3 item-based) and EMERGENCY (maternal labor-triage) producers
// both call `enqueueAlertEvent()` with a normalized event. The orchestrator:
//   1. resolves recipients — active hospital_consult_doctors (hospital_staff)
//      + active moph_center_monitors for the province (province_center);
//   2. writes a status='pending' moph_alert_log row per recipient, persisting
//      hospital_name + the ENCRYPTED patient name (staff-scope only — PDPA:
//      center rows get NULL patient_name_enc). The drain rebuilds the Flex
//      from these stored fields, so no Flex is built/discarded here (codex
//      review P1 fix: the old `void flex` built a staff Flex then threw it
//      away, so staff never received the patient name);
//   3. ON CONFLICT DO NOTHING on the dedup unique index (codex #5) so a repeat
//      enqueue for the same (case,recipient,source,severity,rule,day) is a no-op.
//
// NO LINE I/O happens here — the drain (moph-alert-drain.ts) is the only site
// that calls sendMophPrompt. This keeps the sync path cheap and fail-safe.

import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { encrypt, getEncryptionKey } from '@/lib/encryption';
import { mophAlertsEnabled } from '@/config/moph-alert-config';
import { isValidCid } from '@/services/moph-prompt';
import {
  subscribersForEvent,
  type NotificationDetailLevel,
} from '@/services/notification-preference';
import {
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
  /** Patient name — encrypted at rest for hospital_staff scope; never stored
   *  for province_center (PDPA). */
  patientName?: string | null;
  /** Optional action-button URL. */
  confirmUrl?: string | null;
}

// NOTE: there is deliberately NO `score` field here. The HIGH trigger is ANC
// AncRiskLevel.HR3 (item-based via classifyAncItems), not a CPD numeric score.
// The old `score: number` was vestigial CPD vocabulary (codex review P1/P2:
// HR3/CPD semantic drift) and is removed. The caller gates on HR3, not score.

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
  /** How much this recipient may see. Admin-configured clinical roles (center
   *  monitors, consult doctors) are always 'full'; a self-subscriber carries
   *  whatever their preference row says. */
  detailLevel: NotificationDetailLevel;
}

// HR3/item-based HIGH-risk vocabulary (codex review P1/P2: was anc_cpd/cpd_high,
// misleading because the trigger is ANC HR3, not a CPD score).
const HIGH_RULE_ID = 'hr3';
const HIGH_ALERT_SOURCE = 'anc_hr3';
const EMERGENCY_ALERT_SOURCE = 'maternal_triage';
// Phase 2 producers. The alert_source string IS the subscription key
// (resolveRecipients matches it against notification_event_subscriptions), so
// these must stay identical to the catalog keys in config/notification-events.
const PARTOGRAPH_ALERT_SOURCE = 'partograph_critical';
const PARTOGRAPH_RULE_ID = 'partograph_critical';
const CPD_HIGH_ALERT_SOURCE = 'cpd_high';
const CPD_HIGH_RULE_ID = 'cpd_high';
const REFERRAL_INCOMING_ALERT_SOURCE = 'referral_incoming';
const REFERRAL_INCOMING_RULE_ID = 'referral_incoming';
const REFERRAL_OVERDUE_ALERT_SOURCE = 'referral_overdue';
const REFERRAL_OVERDUE_RULE_ID = 'referral_overdue';

/** Resolve active recipients for a hospital + province.
 *  P1-C contract (codex gap-sweep):
 *   - CENTER monitors (admin-configured via MophAlertsTab) ALWAYS deliver — no
 *     self-subscribe gate; the admin list is the authoritative "main setting".
 *   - Default OFF: hospital staff (consult doctors) deliver ONLY when they have
 *     an enabled notification_preferences row for this hospital AND that row
 *     subscribes to `eventKey`.
 *   - Authoritative self-subscribers: subscribed pref rows NOT on any admin list
 *     are merged (deduped by CID), each carrying its own detail level.
 *  Filters out any recipient whose CID is not exactly 13 digits (the MOPH API
 *  would 400 at drain time, wasting a claim — codex gap-sweep: validate at
 *  enqueue instead).
 *  `eventKey` is the alert_source of the event being enqueued ('anc_hr3',
 *  'maternal_triage'), matched against the subscriber's event set. It is
 *  REQUIRED: an optional event filter would silently default to "deliver
 *  everything" at any call site that forgot it. */
async function resolveRecipients(
  db: DatabaseAdapter,
  hospitalId: string,
  province: string,
  hospitalCodeOverride: string | undefined,
  eventKey: string,
): Promise<Recipient[]> {
  // hospital_code for the preference gate — resolve from hospitalId if not given.
  let hospitalCode = hospitalCodeOverride ?? '';
  if (!hospitalCode) {
    const h = await db.query<{ hcode: string }>(`SELECT hcode FROM hospitals WHERE id = ?`, [
      hospitalId,
    ]);
    hospitalCode = h[0]?.hcode ?? '';
  }
  const staff = await db.query<{ cid: string; name: string }>(
    `SELECT cid, name FROM hospital_consult_doctors
     WHERE hospital_id = ? AND is_active = true`,
    [hospitalId],
  );
  const center =
    province && province.trim()
      ? await db.query<{ cid: string; name: string }>(
          `SELECT cid, name FROM moph_center_monitors
           WHERE province = ? AND is_active = true`,
          [province],
        )
      : [];
  if (!province || !province.trim()) {
    // Empty province silently skips center monitors — surface it so the
    // hospital's province_code gets fixed (codex gap-sweep edge case).
    logger.warn('moph_alert_empty_province', { hospitalId });
  }
  // Subscribed to THIS event, at this hospital. A pref row with no event
  // children counts as subscribed to everything — that back-compat rule lives
  // in subscribersForEvent, and it is what keeps every pre-migration row
  // delivering instead of going silent on deploy.
  const subscribers = await subscribersForEvent(db, hospitalCode, eventKey);
  const byCid = new Map(subscribers.map((s) => [s.cid, s.detailLevel]));
  const allowed: Recipient[] = [];
  // P1-C security/correctness (codex gap-sweep): CENTER monitors are an
  // admin-configured role (MophAlertsTab is the authoritative "main setting"
  // for province monitoring) — they ALWAYS deliver, no self-subscribe gate and
  // no event filter.
  for (const c of center) {
    allowed.push({
      cid: c.cid,
      name: c.name,
      scope: 'province_center' as const,
      // Admin-configured clinical role: always full detail, never downgraded by
      // a self-serve preference.
      detailLevel: 'full',
    });
  }
  // Default OFF: hospital staff (consult doctors) deliver ONLY with a pref row
  // subscribed to this event (self-serve opt-in).
  for (const s of staff) {
    if (byCid.has(s.cid)) {
      allowed.push({
        cid: s.cid,
        name: s.name,
        scope: 'hospital_staff' as const,
        detailLevel: 'full',
      });
    }
  }
  // Authoritative self-subscribers: subscribed pref rows for CIDs not already
  // delivered above (neither staff nor center) — deduped by CID, each at its
  // own chosen detail level.
  const already = new Set(allowed.map((r) => r.cid));
  for (const [cid, detailLevel] of byCid) {
    if (!already.has(cid)) {
      allowed.push({ cid, name: '', scope: 'self_subscribed' as const, detailLevel });
    }
  }

  const valid = allowed.filter((r) => isValidCid(r.cid));
  if (valid.length !== allowed.length) {
    logger.warn('moph_alert_invalid_recipient_cid_skipped', {
      hospitalId,
      skipped: allowed.length - valid.length,
    });
  }
  return valid;
}

/**
 * Insert one pending alert row per recipient, conflict-skipping on the dedup
 * unique index. Returns the number of rows actually inserted (0 = all dupes).
 * Persists hospital_name + encrypted patient name (staff-scope only) so the
 * drain can rebuild a correct, scope-aware Flex without re-fetching patient data.
 */
async function enqueueAlertEvent(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
  severity: AlertSeverity,
  alertSource: string,
  ruleId: string,
): Promise<number> {
  if (!mophAlertsEnabled()) {
    logger.debug('moph_alert_skipped_disabled', { caseRef: ctx.caseRef });
    return 0;
  }
  // alertSource IS the event key subscriptions are stored under (it is what
  // lands in moph_alert_log.alert_source), so it doubles as the event filter.
  // hospitalCodeOverride stays undefined: the preference gate keys on the hcode
  // of the hospitals row, which is also what the profile UI shows users when
  // they subscribe. ctx.originHcode is the code the event arrived under and is
  // not guaranteed to be the same string.
  const recipients = await resolveRecipients(
    db,
    ctx.hospitalId,
    ctx.province,
    undefined,
    alertSource,
  );
  if (recipients.length === 0) {
    logger.warn('moph_alert_no_recipients', { hospitalId: ctx.hospitalId, caseRef: ctx.caseRef });
    return 0;
  }

  const title = alertTitle({ severity, hospitalName: ctx.hospitalName });
  // Encrypt the patient name ONCE per enqueue (staff scope only). Center rows
  // store NULL — they must never carry patient PII at rest or in the message.
  const key = getEncryptionKey();
  if (ctx.patientName && !key) {
    // Fail loud: a missing ENCRYPTION_KEY silently drops the staff patient name
    // (codex gap-sweep). This is a misconfiguration, not a normal path.
    logger.error('moph_alert_encryption_key_missing', { hospitalId: ctx.hospitalId });
  }
  const patientNameEnc = ctx.patientName && key ? encrypt(ctx.patientName, key) : null;

  let inserted = 0;
  for (const r of recipients) {
    const isStaff = r.scope === 'hospital_staff';
    // ON CONFLICT DO NOTHING on the dedup unique index — repeat enqueues are
    // idempotent (codex #5).
    const result = await db.query<{ c: number }>(
      `INSERT INTO moph_alert_log
         (id, case_id, hospital_id, origin_hcode, hospital_name, recipient_cid,
          recipient_scope, detail_level, alert_source, severity, rule_id, title,
          patient_name_enc, status, attempts, local_date, confirm_url,
          created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending',0,$14,$15,NOW(),NOW())
       ON CONFLICT (case_id, hospital_id, recipient_cid, alert_source, severity, rule_id, local_date)
       DO NOTHING
       RETURNING 1::int as c`,
      [
        randomUuid(),
        ctx.caseRef,
        ctx.hospitalId,
        ctx.originHcode,
        ctx.hospitalName,
        r.cid,
        r.scope,
        // Persisted so the drain can render to the right depth — the recipient
        // list is gone by the time the message is built.
        r.detailLevel,
        alertSource,
        severity,
        ruleId,
        title,
        isStaff ? patientNameEnc : null, // PDPA: center rows never store the name
        ctx.localDate,
        ctx.confirmUrl ?? null,
      ],
    );
    if (result.length > 0) inserted++;
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

/**
 * HIGH-risk (ANC HR3) producer. Caller MUST have already gated on
 * classifyAncItems(riskItemIds).level === AncRiskLevel.HR3.
 */
export async function enqueueHighRiskAlert(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'high', HIGH_ALERT_SOURCE, HIGH_RULE_ID);
}

/** EMERGENCY (maternal labor-triage acuity) producer. */
export async function enqueueEmergencyAlert(
  db: DatabaseAdapter,
  ctx: EmergencyEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'emergency', EMERGENCY_ALERT_SOURCE, ctx.ruleId);
}

/**
 * Partograph CRITICAL producer. Caller MUST have already gated on a severity
 * TRANSITION into CRITICAL (`to === 'CRITICAL' && from !== 'CRITICAL'`).
 *
 * Severity is 'emergency', not 'high': a labour crossing the CDSS action line
 * is an act-now event, the same tier as maternal triage — 'high' is the
 * watch-closely tier used by ANC HR3 and CPD.
 */
export async function enqueuePartographCriticalAlert(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'emergency', PARTOGRAPH_ALERT_SOURCE, PARTOGRAPH_RULE_ID);
}

/**
 * CPD HIGH-risk producer. Caller MUST have already gated on the CPD score
 * classifying as RiskLevel.HIGH (config-derived via classifyRiskLevel — never
 * a restated numeric threshold).
 */
export async function enqueueCpdHighAlert(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
): Promise<number> {
  return enqueueAlertEvent(db, ctx, 'high', CPD_HIGH_ALERT_SOURCE, CPD_HIGH_RULE_ID);
}

/**
 * Incoming-referral producer, fired when a referral is first CREATED.
 *
 * `ctx.hospitalId` MUST be the DESTINATION hospital — the party that has to
 * accept the patient. The ingest site is driven by the ORIGIN hospital's
 * gateway, so passing the pushing hospital here would alert the sender about
 * its own outgoing referral and leave the receiver with nothing.
 *
 * Severity is 'high' (watch-closely), not 'emergency': a referral arriving is
 * a workload/acceptance event, not an act-this-minute clinical crisis. The
 * referral's own urgency_level is carried in the case, not in this tier.
 */
export async function enqueueReferralIncomingAlert(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
): Promise<number> {
  return enqueueAlertEvent(
    db,
    ctx,
    'high',
    REFERRAL_INCOMING_ALERT_SOURCE,
    REFERRAL_INCOMING_RULE_ID,
  );
}

/**
 * Overdue-referral producer: an INITIATED referral that has aged past the
 * SLA cutoff without the destination responding.
 *
 * Caller MUST have already applied the threshold from config/referral-sla.ts —
 * this producer restates no policy. It is enqueued once per hospital per push
 * for BOTH parties (see enqueueOverdueReferralAlerts), so `ctx.hospitalId` is
 * whichever party this alert is for, not a fixed side of the referral.
 */
export async function enqueueReferralOverdueAlert(
  db: DatabaseAdapter,
  ctx: AlertEventContext,
): Promise<number> {
  return enqueueAlertEvent(
    db,
    ctx,
    'high',
    REFERRAL_OVERDUE_ALERT_SOURCE,
    REFERRAL_OVERDUE_RULE_ID,
  );
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
