// tests/unit/config/patient-display.test.ts
import { describe, it, expect } from 'vitest';
import { CPD_FACTOR_MAX_SCORES, CPD_FACTOR_WEIGHTS, CPD_MAX_SCORE } from '@/config/risk-levels';
import { ANC_SUMMARY_DISPLAY, classifyAncVisitCount } from '@/config/anc-ops';
import { CARE_STAGE_LABEL_TH, GA_TERM_LABEL_TH, GA_TERM_TONE, classifyGaTerm } from '@/config/obstetric-display';

describe('CPD maxima are derived from the scoring rule, not restated', () => {
  // Sample grid spanning every threshold in CPD_FACTOR_WEIGHTS.
  const GRID: Record<string, number[]> = {
    gravida: [1, 2, 5],
    ancCount: [0, 3, 4, 10],
    gaWeeks: [30, 39, 40, 42],
    heightCm: [140, 149, 150, 154, 155, 170],
    weightDiffKg: [5, 15, 16, 20, 21, 30],
    fundalHeightCm: [30, 34, 35, 36, 37, 40],
    usWeightG: [2500, 3000, 3001, 3500, 3501, 4500],
    hematocritPct: [25, 29, 30, 40],
  };
  it.each(Object.keys(GRID))('%s max = max of evaluate()', (k) => {
    expect(CPD_FACTOR_MAX_SCORES[k as keyof typeof CPD_FACTOR_MAX_SCORES]).toBe(
      Math.max(...GRID[k].map((v) => CPD_FACTOR_WEIGHTS[k].evaluate(v))),
    );
  });
  it('total is the historical 14.5', () => {
    expect(CPD_MAX_SCORE).toBe(14.5);
  });
});

describe('obstetric display', () => {
  it.each([
    [null, null],
    [33, 'veryPreterm'],
    [34, 'preterm'],
    [36, 'preterm'],
    [37, 'term'],
    [41, 'term'],
    [42, 'postTerm'],
  ] as const)('GA %s → %s (old cut-offs < 34, < 37, > 41)', (w, term) => {
    expect(classifyGaTerm(w)).toBe(term);
  });
  it('GA band tone (fix wave minor 5): one mapping, not a restated 34/37/41', () => {
    expect(GA_TERM_TONE).toEqual({ veryPreterm: 'danger', preterm: 'warn', term: 'ok', postTerm: 'danger' });
  });
  it('Thai labels', () => {
    expect(GA_TERM_LABEL_TH).toEqual({
      veryPreterm: 'ก่อนกำหนดมาก',
      preterm: 'ก่อนกำหนด',
      term: 'ครบกำหนด',
      postTerm: 'เกินกำหนด',
    });
    expect(CARE_STAGE_LABEL_TH).toEqual({
      PREGNANCY: 'ฝากครรภ์',
      LABOR: 'ระหว่างคลอด',
      DELIVERED: 'คลอดแล้ว',
      POSTPARTUM: 'หลังคลอด',
    });
  });
});

describe('ANC summary strip bands (moved verbatim from the patient page)', () => {
  it('keeps 4 / 8 visits and 28 days', () => {
    expect(ANC_SUMMARY_DISPLAY).toEqual({ visitsMinimum: 4, visitsTarget: 8, lastVisitAlertDays: 28 });
  });
  it.each([
    [0, 'belowMinimum'],
    [3, 'belowMinimum'],
    [4, 'belowTarget'],
    [7, 'belowTarget'],
    [8, 'met'],
    [12, 'met'],
  ] as const)('%s visits → %s', (n, band) => {
    expect(classifyAncVisitCount(n)).toBe(band);
  });
});

