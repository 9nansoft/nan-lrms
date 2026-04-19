import { describe, it, expect } from 'vitest';
import { _internals } from '@/services/partogram';
import { obs, tAt } from './partogram-cdss-fixtures';

const { analyzeFhr } = _internals;

describe('analyzeFhr — rule 1 (CRITICAL <100 || >180)', () => {
  it('FHR 99 → CRITICAL', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 99 }, tAt(0))]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      severity: 'CRITICAL', section: 'FHR', obsIndex: 0,
      message: 'FHR 99 ครั้ง/นาที (ผิดปกติรุนแรง)',
    });
  });
  it('FHR 100 → ALERT (rule 2 fires, NOT rule 1)', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 100 }, tAt(0))]);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({
      severity: 'ALERT', section: 'FHR',
      message: 'FHR 100 ครั้ง/นาที (นอกช่วง 110-160)',
    });
  });
  it('FHR 181 → CRITICAL', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 181 }, tAt(0))]);
    expect(a[0].severity).toBe('CRITICAL');
    expect(a[0].message).toBe('FHR 181 ครั้ง/นาที (ผิดปกติรุนแรง)');
  });
  it('FHR 180 → ALERT (180 is NOT > 180)', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 180 }, tAt(0))]);
    expect(a[0].severity).toBe('ALERT');
  });
});

describe('analyzeFhr — rule 2 (ALERT outside 110-160)', () => {
  it('FHR 109 → ALERT', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 109 }, tAt(0))]);
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('ALERT');
  });
  it('FHR 110 → no alert', () => {
    expect(analyzeFhr([obs({ fetalHeartRate: 110 }, tAt(0))])).toEqual([]);
  });
  it('FHR 111 → no alert', () => {
    expect(analyzeFhr([obs({ fetalHeartRate: 111 }, tAt(0))])).toEqual([]);
  });
  it('FHR 160 → no alert', () => {
    expect(analyzeFhr([obs({ fetalHeartRate: 160 }, tAt(0))])).toEqual([]);
  });
  it('FHR 161 → ALERT', () => {
    const a = analyzeFhr([obs({ fetalHeartRate: 161 }, tAt(0))]);
    expect(a).toHaveLength(1);
    expect(a[0].severity).toBe('ALERT');
  });
});

describe('analyzeFhr — rule 3 (2 consecutive <110 → CRITICAL)', () => {
  it('two consecutive [105, 100] → CRITICAL on index 1 from rule 3 + ALERT on each from rule 2', () => {
    const list = [
      obs({ fetalHeartRate: 105 }, tAt(0)),
      obs({ fetalHeartRate: 100 }, tAt(15)),
    ];
    const a = analyzeFhr(list);
    // rule 2 fires for both (105 and 100 are <110); rule 3 also fires on idx 1
    expect(a).toHaveLength(3);
    expect(a.filter((x) => x.obsIndex === 0)).toHaveLength(1);
    const idx1 = a.filter((x) => x.obsIndex === 1);
    expect(idx1).toHaveLength(2);
    expect(idx1.some((x) =>
      x.severity === 'CRITICAL' &&
      x.message === 'หัวใจทารกเต้นช้าต่อเนื่อง 2 ครั้ง',
    )).toBe(true);
  });
  it('counter resets after a normal reading', () => {
    const list = [
      obs({ fetalHeartRate: 105 }, tAt(0)),
      obs({ fetalHeartRate: 100 }, tAt(15)),
      obs({ fetalHeartRate: 130 }, tAt(30)),
      obs({ fetalHeartRate: 105 }, tAt(45)),
    ];
    const a = analyzeFhr(list);
    // Only one rule-3 CRITICAL (on idx 1). idx 3 is a single low reading.
    const rule3 = a.filter((x) => x.message === 'หัวใจทารกเต้นช้าต่อเนื่อง 2 ครั้ง');
    expect(rule3).toHaveLength(1);
    expect(rule3[0].obsIndex).toBe(1);
  });
});

describe('analyzeFhr — rule 4 (2 consecutive >160 → CRITICAL)', () => {
  it('two consecutive [165, 170] → CRITICAL on index 1', () => {
    const list = [
      obs({ fetalHeartRate: 165 }, tAt(0)),
      obs({ fetalHeartRate: 170 }, tAt(15)),
    ];
    const a = analyzeFhr(list);
    expect(a.some((x) =>
      x.obsIndex === 1 && x.severity === 'CRITICAL' &&
      x.message === 'หัวใจทารกเต้นเร็วต่อเนื่อง 2 ครั้ง',
    )).toBe(true);
  });
  it('counter resets after a normal reading (≤160)', () => {
    const list = [
      obs({ fetalHeartRate: 165 }, tAt(0)),
      obs({ fetalHeartRate: 160 }, tAt(15)),
      obs({ fetalHeartRate: 170 }, tAt(30)),
    ];
    const a = analyzeFhr(list);
    const rule4 = a.filter((x) => x.message === 'หัวใจทารกเต้นเร็วต่อเนื่อง 2 ครั้ง');
    expect(rule4).toHaveLength(0);
  });
});

describe('analyzeFhr — null/zero handling', () => {
  it('null FHR alone → no alerts', () => {
    expect(analyzeFhr([obs({ fetalHeartRate: null }, tAt(0))])).toEqual([]);
  });
  it('zero FHR alone → no alerts (Pascal: FHR <= 0 → Continue)', () => {
    expect(analyzeFhr([obs({ fetalHeartRate: 0 }, tAt(0))])).toEqual([]);
  });
  it('null reading does NOT reset rule 3 counter (Pascal Continue skips both increment AND reset)', () => {
    // Per Pascal: if FHR<=0 → Continue → counter neither increments nor resets.
    // So [105, null, 100] should still trigger rule 3 on the third index.
    const list = [
      obs({ fetalHeartRate: 105 }, tAt(0)),
      obs({ fetalHeartRate: null }, tAt(15)),
      obs({ fetalHeartRate: 100 }, tAt(30)),
    ];
    const a = analyzeFhr(list);
    const rule3 = a.filter((x) => x.message === 'หัวใจทารกเต้นช้าต่อเนื่อง 2 ครั้ง');
    expect(rule3).toHaveLength(1);
    expect(rule3[0].obsIndex).toBe(2);
  });
});
