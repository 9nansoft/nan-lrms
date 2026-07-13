// PATCH /api/referrals/[id]/transit — SOURCE hospital marks the patient in transit.
import { referralTransitionRoute } from '@/lib/referral-http';
import { markInTransit } from '@/services/referral';

export const PATCH = referralTransitionRoute({
  side: 'from',
  requiredField: 'transportMode',
  logEvent: 'referral_transit_failed',
  run: (db, id, body) => markInTransit(db, id, String(body.transportMode)),
});
