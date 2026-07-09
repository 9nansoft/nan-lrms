// Hospital network board policy — sync freshness classification and the
// combined-workload weighting used by the /hospitals roster and map pins.
import { describe, it, expect } from 'vitest';
import {
  SYNC_HEALTH,
  classifySyncHealth,
  ANC_WORKLOAD_WEIGHT,
  combinedWorkload,
  PARTOGRAPH_QUALITY,
  classifyPartographCoverage,
} from '@/config/hospital-network';

const NOW = new Date('2026-07-09T12:00:00+07:00');

function minutesAgo(m: number): string {
  return new Date(NOW.getTime() - m * 60_000).toISOString();
}

describe('classifySyncHealth', () => {
  it('classifies fresh, stale, and critical syncs by age', () => {
    expect(classifySyncHealth('OK', minutesAgo(5), NOW)).toBe('ok');
    expect(classifySyncHealth('OK', minutesAgo(SYNC_HEALTH.staleAfterMinutes + 10), NOW)).toBe(
      'stale',
    );
    expect(
      classifySyncHealth('OK', minutesAgo(SYNC_HEALTH.criticalAfterHours * 60 + 10), NOW),
    ).toBe('critical');
  });

  it('BLOCKED wins over any timestamp; missing sync data is never', () => {
    expect(classifySyncHealth('BLOCKED', minutesAgo(5), NOW)).toBe('blocked');
    expect(classifySyncHealth('NEVER_SYNCED', null, NOW)).toBe('never');
    // Status says OK but no timestamp ever recorded → never.
    expect(classifySyncHealth('OK', null, NOW)).toBe('never');
  });
});

describe('combinedWorkload', () => {
  it('weights ANC registry size alongside the labor floor', () => {
    expect(combinedWorkload({ total: 0 }, { total: 0 })).toBe(0);
    expect(combinedWorkload({ total: 2 }, { total: 30 })).toBe(2 + 30 * ANC_WORKLOAD_WEIGHT);
    // An ANC-only hospital still registers as active.
    expect(combinedWorkload({ total: 0 }, { total: 215 })).toBeGreaterThan(5);
  });

  describe('classifyPartographCoverage', () => {
    it('classifies by the configured thresholds; no admissions → none', () => {
      expect(classifyPartographCoverage(0, 0)).toBe('none');
      expect(classifyPartographCoverage(10, 1)).toBe('critical'); // 10% < criticalBelowPct
      expect(classifyPartographCoverage(10, 5)).toBe('warn'); // 50% < warnBelowPct
      expect(classifyPartographCoverage(10, 8)).toBe('ok');
      expect(PARTOGRAPH_QUALITY.windowDays).toBeGreaterThan(0);
    });
  });
});
