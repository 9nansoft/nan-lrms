import { describe, it, expect } from 'vitest';
import {
  analyzePartograph, highestSeverity, countBySeverity,
} from '@/services/partogram';
import type { CdssAlertDto, PartographObservationDto } from '@/types/api';

const blankObs: PartographObservationDto = {
  id: 'o-1', observeDatetime: '2026-04-19T10:00:00Z', hourNo: 1,
  fetalHeartRate: null, amnioticFluid: null, amnioticTypeName: null,
  moulding: null, cervicalDilationCm: null, descentOfHead: null,
  contractionPer10Min: null, contractionDurationSec: null,
  contractionStrength: null, oxytocinUml: null, oxytocinDropsMin: null,
  drugsIvFluids: null, pulse: null, bpSystolic: null, bpDiastolic: null,
  temperature: null, urineVolumeMl: null, urineProtein: null,
  urineGlucose: null, urineAcetone: null, note: null, entryStaff: null,
};

describe('analyzePartograph orchestrator', () => {
  it('returns [] for empty observations', () => {
    expect(analyzePartograph({ an: 'A' }, [])).toEqual([]);
  });
  it('returns [] when nothing is abnormal', () => {
    expect(analyzePartograph({ an: 'A' }, [blankObs])).toEqual([]);
  });
});

describe('highestSeverity', () => {
  const a = (s: CdssAlertDto['severity']): CdssAlertDto =>
    ({ severity: s, section: 'FHR', message: 'x', obsIndex: 0 });
  it('returns null on empty', () => {
    expect(highestSeverity([])).toBeNull();
  });
  it('returns CRITICAL when present', () => {
    expect(highestSeverity([a('WARN'), a('CRITICAL'), a('INFO')]))
      .toBe('CRITICAL');
  });
  it('orders WARN > INFO', () => {
    expect(highestSeverity([a('INFO'), a('WARN')])).toBe('WARN');
  });
});

describe('countBySeverity', () => {
  it('counts each level', () => {
    const a = (s: CdssAlertDto['severity']): CdssAlertDto =>
      ({ severity: s, section: 'FHR', message: 'x', obsIndex: 0 });
    const list = [a('WARN'), a('WARN'), a('CRITICAL')];
    expect(countBySeverity(list, 'WARN')).toBe(2);
    expect(countBySeverity(list, 'CRITICAL')).toBe(1);
    expect(countBySeverity(list, 'INFO')).toBe(0);
  });
});
