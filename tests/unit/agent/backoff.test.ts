// Backoff for cycles the server keeps refusing.
//
// A permanent block (403 — hospital purged/inactive) or a dead credential
// (401 — key revoked) cannot succeed on a fast retry, but the agent must not
// spin on it either: the wait grows 30 min → 2× → … capped at 6 h, and any
// clean cycle restores the configured interval. Recovery needs no restart —
// an admin re-onboards the hospital and the next (slow) cycle succeeds.
import { describe, it, expect } from 'vitest';
import {
  nextWait,
  isAuthRefusal,
  BLOCKED_FIRST_WAIT_MINUTES,
  BLOCKED_BACKOFF_CAP_MINUTES,
} from '../../../agent/src/backoff';

const MINUTE = 60_000;

describe('nextWait', () => {
  it('uses the configured interval on a clean cycle and clears any backoff', () => {
    expect(nextWait(5, 240, false)).toEqual({ waitMs: 5 * MINUTE, backoffMinutes: 0 });
    expect(nextWait(5, 0, false)).toEqual({ waitMs: 5 * MINUTE, backoffMinutes: 0 });
  });

  it('starts the backoff at 30 minutes on the first refused cycle', () => {
    expect(nextWait(5, 0, true)).toEqual({
      waitMs: BLOCKED_FIRST_WAIT_MINUTES * MINUTE,
      backoffMinutes: BLOCKED_FIRST_WAIT_MINUTES,
    });
  });

  it('doubles the previous backoff on the next refused cycle', () => {
    expect(nextWait(5, 30, true)).toEqual({ waitMs: 60 * MINUTE, backoffMinutes: 60 });
    expect(nextWait(5, 60, true)).toEqual({ waitMs: 120 * MINUTE, backoffMinutes: 120 });
  });

  it('caps the backoff at six hours', () => {
    expect(nextWait(5, 240, true)).toEqual({
      waitMs: BLOCKED_BACKOFF_CAP_MINUTES * MINUTE,
      backoffMinutes: BLOCKED_BACKOFF_CAP_MINUTES,
    });
    // And stays there while the refusals continue.
    expect(nextWait(5, BLOCKED_BACKOFF_CAP_MINUTES, true)).toEqual({
      waitMs: BLOCKED_BACKOFF_CAP_MINUTES * MINUTE,
      backoffMinutes: BLOCKED_BACKOFF_CAP_MINUTES,
    });
  });

  it('recovers: a clean cycle after refused ones returns to the interval', () => {
    const refused = nextWait(5, 60, true);
    const recovered = nextWait(5, refused.backoffMinutes, false);
    expect(recovered).toEqual({ waitMs: 5 * MINUTE, backoffMinutes: 0 });
  });
});

describe('isAuthRefusal', () => {
  it('recognises the push statuses a retry cannot fix', () => {
    expect(isAuthRefusal(new Error('browser-push HTTP 401: invalid_api_key'))).toBe(true);
    expect(isAuthRefusal(new Error('browser-push HTTP 403: hospital_inactive'))).toBe(true);
    expect(isAuthRefusal('permanently_blocked: hospital_purged_pending_reonboard')).toBe(true);
  });

  it('leaves every other failure on the normal interval', () => {
    expect(isAuthRefusal(new Error('browser-push HTTP 500: boom'))).toBe(false);
    expect(isAuthRefusal(new Error('local gateway http://127.0.0.1:45011 ตอบ 403'))).toBe(false);
    expect(isAuthRefusal(new Error('fetch failed'))).toBe(false);
    expect(isAuthRefusal('string error')).toBe(false);
  });
});
