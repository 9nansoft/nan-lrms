// A freshness snapshot is only trustworthy while polling succeeds and it is
// recent. SWR keeps the last good payload when refreshes fail, so the strip
// must not keep presenting it as current (2026-10-11 final-review finding).
import { describe, it, expect } from 'vitest';
import { isSnapshotCurrent } from '@/lib/sync-age';
import { SYNC_FRESHNESS_POLL } from '@/config/hospital-network';

const NOW = 1_800_000_000_000;

describe('isSnapshotCurrent', () => {
  it('a just-received snapshot with no error is current', () => {
    expect(isSnapshotCurrent({ receivedAt: NOW - 1_000, hasError: false, now: NOW })).toBe(true);
  });

  it('any refresh error makes the cached snapshot not current', () => {
    expect(isSnapshotCurrent({ receivedAt: NOW - 1_000, hasError: true, now: NOW })).toBe(false);
  });

  it('a snapshot older than the max age is not current even without an error (hung request)', () => {
    const old = NOW - SYNC_FRESHNESS_POLL.maxSnapshotAgeMs - 1;
    expect(isSnapshotCurrent({ receivedAt: old, hasError: false, now: NOW })).toBe(false);
  });

  it('max age allows one missed refresh but not two', () => {
    expect(SYNC_FRESHNESS_POLL.maxSnapshotAgeMs).toBeGreaterThan(SYNC_FRESHNESS_POLL.refreshMs);
    expect(SYNC_FRESHNESS_POLL.maxSnapshotAgeMs).toBeLessThan(3 * SYNC_FRESHNESS_POLL.refreshMs);
  });

  it.each([undefined, NaN])('missing/invalid receivedAt %p is not current', (receivedAt) => {
    expect(isSnapshotCurrent({ receivedAt: receivedAt as number, hasError: false, now: NOW })).toBe(
      false,
    );
  });
});
