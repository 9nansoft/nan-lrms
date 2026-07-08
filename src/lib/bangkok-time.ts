// Shared Asia/Bangkok (UTC+7, no DST) time helpers.
//
// Extracted from src/services/dashboard.ts so other services (referral list,
// KPI windows) can reuse the same day-boundary semantics instead of
// duplicating timezone math.

/** Returns the start of today in Asia/Bangkok, expressed as UTC. */
export function bangkokStartOfToday(now: Date = new Date()): Date {
  // Bangkok is UTC+7, no DST. Compute by shifting now() forward 7h, taking
  // the UTC date at that shifted point, and then shifting back.
  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  const shiftedMidnightUtc = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()),
  );
  return new Date(shiftedMidnightUtc.getTime() - 7 * 3600 * 1000);
}
