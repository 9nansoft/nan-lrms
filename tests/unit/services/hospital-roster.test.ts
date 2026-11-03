// tests/unit/services/hospital-roster.test.ts
import { describe, it, expect } from 'vitest';
import { groupRosterByLevel, rosterArea, searchRoster, summarizeRoster } from '@/services/hospital-roster';
import { HOSPITAL_LEVELS } from '@/config/hospitals';
import { HospitalLevel } from '@/types/domain';
import type { DashboardHospital } from '@/types/api';

const MIN = 60_000;
const now = new Date('2026-10-11T08:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

function h(p: Partial<DashboardHospital> & Pick<DashboardHospital, 'hcode' | 'name'>): DashboardHospital {
  return {
    level: HospitalLevel.M2,
    connectionStatus: 'ONLINE' as DashboardHospital['connectionStatus'],
    lastSyncAt: ago(2 * MIN),
    counts: { low: 0, medium: 0, high: 0, total: 0 },
    ancCounts: { total: 0, hr3: 0 },
    partographQuality: { laborRecent: 0, withPartograph: 0 },
    syncStatus: 'OK' as DashboardHospital['syncStatus'],
    syncBlockedReason: null,
    ...p,
  } as DashboardHospital;
}

const roster = [
  h({ hcode: '10670', name: 'รพ.ขอนแก่น', level: HospitalLevel.A_S, lastSyncAt: ago(13 * 24 * 60 * MIN), ancCounts: { total: 62, hr3: 5 }, partographQuality: { laborRecent: 10, withPartograph: 2 } }),
  h({ hcode: '10995', name: 'รพ.บ้านฝาง', counts: { low: 1, medium: 0, high: 0, total: 1 }, ancCounts: { total: 215, hr3: 20 }, partographQuality: { laborRecent: 4, withPartograph: 3 } }),
  h({ hcode: '10996', name: 'รพ.พระยืน', connectionStatus: 'OFFLINE' as DashboardHospital['connectionStatus'], lastSyncAt: null, ancCounts: { total: 10, hr3: 0 }, syncStatus: 'BLOCKED' as DashboardHospital['syncStatus'] }),
];

describe('summarizeRoster', () => {
  it('sums per-hospital server aggregates, never row counts of a capped fetch', () => {
    const s = summarizeRoster(roster, now);
    expect(s.hospitals).toBe(3);
    expect(s.anc).toBe(287);
    expect(s.ancHr3).toBe(25);
    expect(s.labor).toEqual({ total: 1, low: 1, medium: 0, high: 0 });
    expect(s.sync).toEqual({ ok: 1, stale: 0, critical: 1, never: 0, blocked: 1 });
    expect(s.syncAttention).toBe(2);
    expect(s.withWorkload).toBe(3);
  });

  it('partograph coverage: province % over the window and hospitals below threshold', () => {
    const p = summarizeRoster(roster, now).parto;
    expect(p).toMatchObject({ recent: 14, charted: 5, pct: 36, below: 1 });
    expect(summarizeRoster([], now).parto.pct).toBeNull();
  });
});

describe('groupRosterByLevel', () => {
  it('orders groups by level sortOrder and hospitals busiest-first', () => {
    const groups = groupRosterByLevel(roster);
    const order = groups.map((g) => g.level);
    expect(order).toEqual(
      [...order].sort((a, b) => HOSPITAL_LEVELS[a].sortOrder - HOSPITAL_LEVELS[b].sortOrder),
    );
    const m2 = groups.find((g) => g.level === HospitalLevel.M2)!;
    expect(m2.nameTh).toBe(HOSPITAL_LEVELS[HospitalLevel.M2].nameTh);
    expect(m2.hospitals.map((x) => x.hcode)).toEqual(['10995', '10996']);
    expect(m2.stats).toEqual({ anc: 225, labor: 1, high: 0 });
  });

  it('drops empty levels', () => {
    expect(groupRosterByLevel([])).toEqual([]);
  });
});

describe('rosterArea / searchRoster', () => {
  it('splits Nan hospitals from guests and searches name or hcode', () => {
    expect(rosterArea({ hcode: '10716' })).toBe('nan');
    expect(rosterArea({ hcode: '99902' })).toBe('other');
    expect(searchRoster(roster, ' ฝาง ').map((x) => x.hcode)).toEqual(['10995']);
    expect(searchRoster(roster, '10996').map((x) => x.hcode)).toEqual(['10996']);
    expect(searchRoster(roster, '')).toBe(roster);
  });
});
