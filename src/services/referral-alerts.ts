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
