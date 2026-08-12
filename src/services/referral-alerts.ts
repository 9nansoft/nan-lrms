// Referral notification producers (Phase 2 of the notification-events design:
// docs/superpowers/specs/2026-08-07-notification-events-design.md).
//
// Kept out of `referral.ts` on purpose: that module is the referral STATE
// MACHINE (accept/reject/transit/arrive + the access guards the route handlers
// call). Alerting is a different concern with a different lifecycle — it hangs
// off the sync tick, not off a user action — and folding the MOPH-alert stack
// into the state machine would make every referral route pull it in.
//
// `referralCaseRef` lives here rather than at either call site because BOTH
// referral events must name the same case (Constitution III: extract, never
// duplicate).
import type { DatabaseAdapter } from '@/db/adapter';
import { ReferralStatus } from '@/types/domain';
import { referralSlaCutoffs } from '@/config/referral-sla';
import { resolveAlertOrigin, decryptPatientName } from '@/services/alert-context';
import { enqueueReferralOverdueAlert } from '@/services/risk-alert';
import { logger } from '@/lib/logger';

/**
 * The case reference shared by `referral_incoming` and `referral_overdue`, so
 * the two events about one referral resolve to the same case in the alert log
 * and in a doctor's chat.
 *
 * The origin hcode is load-bearing, not decoration: HOSxP refer numbers reset
 * yearly and are unique only per origin hospital (see the KEY_REUSE_GUARD
 * comment in sync/referrals.ts). PDPA: this string is rendered into the LINE
 * message, so it must never carry a national ID.
 */
export function referralCaseRef(originHcode: string, referNumber: string): string {
  return `REF-${originHcode}-${referNumber}`;
}

/**
 * Enqueue `referral_overdue` alerts for `hospitalId`.
 *
 * Nothing *happens* when a referral merely gets old, so unlike every other
 * producer this one has no event to hang on — it is evaluated on the sync tick.
 *
 * Both parties are alerted because both must act: the destination has not
 * accepted, and the origin has a patient in limbo. The spec's footnote ¹ allows
 * patient-level detail exactly when the subscriber's own hospital is the origin
 * or the destination, which is the set this query produces. Since the caller
 * runs it once per hospital per push, each party's alert lands under its own
 * `hospital_id`, and the day-granular dedup index collapses repeat pushes into
 * one alert per referral per hospital per day.
 *
 * Best-effort by contract: alerting must never fail a sync, so every failure
 * is logged and swallowed. Returns the number of alert rows actually inserted.
 */
export async function enqueueOverdueReferralAlerts(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<number> {
  let enqueued = 0;
  try {
    // Threshold comes from config, never restated here.
    const { overdueBefore } = referralSlaCutoffs(new Date());
    // The ORIGIN hcode is needed even when alerting the destination (it is part
    // of the caseRef), so join hospitals rather than querying per row. The
    // journey carries the patient name, encrypted at rest.
    const rows = await db.query<{
      id: string;
      refer_number: string | null;
      origin_hcode: string;
      patient_name: string | null;
    }>(
      `SELECT cr.id, cr.refer_number, origin.hcode AS origin_hcode, mj.name AS patient_name
         FROM cached_referrals cr
         JOIN hospitals origin ON origin.id = cr.from_hospital_id
         LEFT JOIN maternal_journeys mj ON mj.id = cr.journey_id
        WHERE cr.status = ?
          AND cr.initiated_at < ?
          AND (cr.from_hospital_id = ? OR cr.to_hospital_id = ?)`,
      // Only INITIATED referrals age — once the destination has responded the
      // sending side no longer owns the delay (classifyReferralAge).
      [ReferralStatus.INITIATED, overdueBefore, hospitalId, hospitalId],
    );
    if (rows.length === 0) return 0;

    const hcodeRows = await db.query<{ hcode: string }>(
      'SELECT hcode FROM hospitals WHERE id = ?',
      [hospitalId],
    );
    const hcode = hcodeRows[0]?.hcode ?? '';
    const origin = await resolveAlertOrigin(db, hospitalId, hcode);

    for (const row of rows) {
      try {
        enqueued += await enqueueReferralOverdueAlert(db, {
          hospitalId,
          originHcode: hcode,
          hospitalName: origin.hospitalName,
          province: origin.province,
          // Webhook-ingested rows may have no refer_number; the referral's own
          // id keeps the reference stable and non-identifying.
          caseRef: referralCaseRef(row.origin_hcode, row.refer_number ?? row.id),
          localDate: origin.localDate,
          patientName: decryptPatientName(row.patient_name),
          confirmUrl: null,
        });
      } catch (e) {
        logger.warn('moph_alert_referral_overdue_enqueue_failed', {
          hospitalId,
          referralId: row.id,
          error: e,
        });
      }
    }
  } catch (e) {
    // A failed scan must not turn a successful referral persist into a warning.
    logger.warn('moph_alert_referral_overdue_scan_failed', { hospitalId, error: e });
  }
  return enqueued;
}
