// PATCH /api/referrals/[id]/reject — destination hospital rejects a referral.
import { referralTransitionRoute } from '@/lib/referral-http';
import { rejectReferral } from '@/services/referral';

export const PATCH = referralTransitionRoute({
  side: 'to',
  requiredField: 'reason',
  logEvent: 'referral_reject_failed',
  run: (db, id, body) =>
    rejectReferral(
      db,
      id,
      String(body.reason),
      body.suggestedAlternativeId != null ? String(body.suggestedAlternativeId) : undefined,
    ),
});
