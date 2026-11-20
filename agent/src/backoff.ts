// Backoff for cycles the server will keep refusing.
//
// A permanent block (HTTP 403 — hospital purged/inactive) or a dead
// credential (HTTP 401 — key revoked) will never succeed on a retry, but the
// agent must not give up for good either: an admin can re-onboard the
// hospital or re-mint the key, and the agent should pick that up by itself.
// So a refused cycle grows the wait — 30 minutes, then double, capped at six
// hours — and any clean cycle resets it. The alternative (a fresh doomed
// request every intervalMinutes) is the spam the browser tab avoids by
// latching its own permanentBlock flag.
export const BLOCKED_FIRST_WAIT_MINUTES = 30;
export const BLOCKED_BACKOFF_CAP_MINUTES = 360;

/**
 * The wait after a cycle and the backoff it leaves behind.
 *
 * `backoffMinutes` is the backoff the PREVIOUS refused cycle set (0 when the
 * agent was running clean). `blocked` is whether this cycle was refused
 * permanently (403 permanentBlock) or lost its credential (401).
 */
export function nextWait(
  intervalMinutes: number,
  backoffMinutes: number,
  blocked: boolean,
): { waitMs: number; backoffMinutes: number } {
  if (!blocked) {
    return { waitMs: intervalMinutes * 60_000, backoffMinutes: 0 };
  }
  const next =
    backoffMinutes <= 0
      ? BLOCKED_FIRST_WAIT_MINUTES
      : Math.min(backoffMinutes * 2, BLOCKED_BACKOFF_CAP_MINUTES);
  return { waitMs: next * 60_000, backoffMinutes: next };
}

/**
 * True when an error is the server refusing this agent for good — the two
 * statuses a retry cannot fix without an admin's help.
 */
export function isAuthRefusal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /browser-push HTTP 40[13]/.test(message);
}
