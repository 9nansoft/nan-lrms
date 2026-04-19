import { describe, it, expect } from 'vitest';
import { _internals } from '@/services/partogram';
import { obs, tAt } from './partogram-cdss-fixtures';

const { analyzeCervix } = _internals;

describe('analyzeCervix — rules 10/11 alert/action line', () => {
  it('on-track 1cm/h progression → no alert', () => {
    const list = [
      obs({ cervicalDilationCm: 4 }, tAt(0)),
      obs({ cervicalDilationCm: 5 }, tAt(60)),
    ];
    expect(analyzeCervix(list)).toEqual([]);
  });
  it('4cm at 0h, 4.5cm at 1h → ALERT (Alert line)', () => {
    const list = [
      obs({ cervicalDilationCm: 4 }, tAt(0)),
      obs({ cervicalDilationCm: 4.5 }, tAt(60)),
    ];
    const a = analyzeCervix(list);
    const alertLine = a.find((x) => x.severity === 'ALERT' && x.section === 'CERVIX');
    expect(alertLine).toBeDefined();
    expect(alertLine!.obsIndex).toBe(1);
    expect(alertLine!.message).toBe('ปากมดลูก 4.5 ซม. เลย Alert line (คาด 5.0)');
  });
  it('4cm at 0h, 0.5cm at 1h → CRITICAL (Action line)', () => {
    // expected = 4 + 1 = 5; 0.5 < (5 - 4) = 1 → action line
    const list = [
      obs({ cervicalDilationCm: 4 }, tAt(0)),
      obs({ cervicalDilationCm: 0.5 }, tAt(60)),
    ];
    const a = analyzeCervix(list);
    // Skip rule applies: dilation <= 0? 0.5 > 0, so it does evaluate.
    const action = a.find((x) => x.severity === 'CRITICAL' && x.section === 'CERVIX');
    expect(action).toBeDefined();
    expect(action!.message).toBe('ปากมดลูก 0.5 ซม. เลย Action line (คาด 5.0+)');
  });
  it('skips obs with dilation 0 / null when checking alert line', () => {
    const list = [
      obs({ cervicalDilationCm: 4 }, tAt(0)),
      obs({ cervicalDilationCm: 0 }, tAt(60)),
      obs({ cervicalDilationCm: null }, tAt(120)),
    ];
    // Only anchor (idx 0). Subsequent rows skipped, so no alert/action.
    expect(analyzeCervix(list).filter((x) => x.section === 'CERVIX')).toEqual([]);
  });
});

describe('analyzeCervix — rule 12 latent phase prolonged', () => {
  it('all <4cm spanning exactly 8h → no alert (Pascal uses >, not >=)', () => {
    const list = [
      obs({ cervicalDilationCm: 2 }, tAt(0)),
      obs({ cervicalDilationCm: 3 }, tAt(8 * 60)),
    ];
    expect(analyzeCervix(list)).toEqual([]);
  });
  it('all <4cm spanning 8.1h → ALERT', () => {
    const list = [
      obs({ cervicalDilationCm: 2 }, tAt(0)),
      obs({ cervicalDilationCm: 3 }, tAt(8 * 60 + 6)),
    ];
    const a = analyzeCervix(list);
    const latent = a.find((x) => x.section === 'CERVIX' && x.severity === 'ALERT');
    expect(latent).toBeDefined();
    expect(latent!.message).toMatch(/^Latent phase ยาวนาน \(\d+ ชม\.\)$/);
    expect(latent!.obsIndex).toBe(1); // High(Obs)
  });
  it('any obs >= 4cm → no latent rule', () => {
    const list = [
      obs({ cervicalDilationCm: 2 }, tAt(0)),
      obs({ cervicalDilationCm: 4 }, tAt(10 * 60)),
    ];
    const a = analyzeCervix(list);
    expect(a.some((x) => x.message.startsWith('Latent phase'))).toBe(false);
  });
});

describe('analyzeCervix — rule 13 LCG time-per-cm stall', () => {
  it('5cm at 0h, 5cm at 6h → no alert (exactly threshold; Pascal >)', () => {
    const list = [
      obs({ cervicalDilationCm: 5 }, tAt(0)),
      obs({ cervicalDilationCm: 5 }, tAt(6 * 60)),
    ];
    const a = analyzeCervix(list);
    expect(a.some((x) => x.message.startsWith('หยุดที่ 5'))).toBe(false);
  });
  it('5cm at 0h, 5cm at 6:01 → ALERT (LCG stall)', () => {
    const list = [
      obs({ cervicalDilationCm: 5 }, tAt(0)),
      obs({ cervicalDilationCm: 5 }, tAt(6 * 60 + 1)),
    ];
    const a = analyzeCervix(list);
    const stall = a.find((x) => x.message.startsWith('หยุดที่ 5'));
    expect(stall).toBeDefined();
    expect(stall!.severity).toBe('ALERT');
    expect(stall!.section).toBe('CERVIX');
    expect(stall!.obsIndex).toBe(1);
  });
  it('uses LCG threshold table {5:6, 6:5, 7:3, 8:2.5, 9:2}', () => {
    // 7cm at 0h, 7cm at 3:01 → stall (>3.0)
    const list = [
      obs({ cervicalDilationCm: 7 }, tAt(0)),
      obs({ cervicalDilationCm: 7 }, tAt(3 * 60 + 1)),
    ];
    const a = analyzeCervix(list);
    const stall = a.find((x) => x.message.startsWith('หยุดที่ 7'));
    expect(stall).toBeDefined();
    expect(stall!.message).toMatch(/เกณฑ์ LCG 3\.0 ชม\.\)$/);
  });
});

describe('analyzeCervix — rule 14 active-phase arrest', () => {
  it('last two obs both 5cm at 0h and 2h (span exactly 2h) → no arrest (Pascal >)', () => {
    const list = [
      obs({ cervicalDilationCm: 5 }, tAt(0)),
      obs({ cervicalDilationCm: 5 }, tAt(2 * 60)),
    ];
    const a = analyzeCervix(list);
    expect(a.some((x) => x.message.startsWith('Labour arrest'))).toBe(false);
  });
  it('last two obs both 5cm at 0h and 2:01 → CRITICAL (active arrest)', () => {
    const list = [
      obs({ cervicalDilationCm: 5 }, tAt(0)),
      obs({ cervicalDilationCm: 5 }, tAt(2 * 60 + 1)),
    ];
    const a = analyzeCervix(list);
    const arrest = a.find((x) => x.message.startsWith('Labour arrest'));
    expect(arrest).toBeDefined();
    expect(arrest!.severity).toBe('CRITICAL');
    expect(arrest!.section).toBe('CERVIX');
    expect(arrest!.obsIndex).toBe(1);
  });
  it('absolute progress >= 0.5cm → no arrest', () => {
    const list = [
      obs({ cervicalDilationCm: 5 }, tAt(0)),
      obs({ cervicalDilationCm: 5.5 }, tAt(3 * 60)),
    ];
    const a = analyzeCervix(list);
    expect(a.some((x) => x.message.startsWith('Labour arrest'))).toBe(false);
  });
});

describe('analyzeCervix — empty input', () => {
  it('returns [] for empty observations', () => {
    expect(analyzeCervix([])).toEqual([]);
  });
});
