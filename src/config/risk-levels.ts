// T014: CPD risk level configuration per SPEC.md section 4.1.2-4.1.3

import { RiskLevel } from '@/types/domain';
import { COLOR } from '@/config/design-tokens';

export interface RiskLevelConfig {
  level: RiskLevel;
  minScore: number;
  maxScore: number;
  color: string;
  bgColor: string;
  textColor: string;
  labelTh: string;
  /** Compact Thai label for dense chips (accessible name stays labelTh). */
  shortLabelTh: string;
  labelEn: string;
  action: string;
}

export const RISK_LEVELS: Record<RiskLevel, RiskLevelConfig> = {
  [RiskLevel.LOW]: {
    level: RiskLevel.LOW,
    minScore: 0,
    maxScore: 4.99,
    color: COLOR.riskLow,
    bgColor: COLOR.riskLowTint,
    textColor: COLOR.riskLowText,
    labelTh: 'เสี่ยงต่ำ',
    shortLabelTh: 'ต่ำ',
    labelEn: 'Low Risk',
    action: 'ติดตามปกติ',
  },
  [RiskLevel.MEDIUM]: {
    level: RiskLevel.MEDIUM,
    minScore: 5,
    maxScore: 9.99,
    color: COLOR.riskMedium,
    bgColor: COLOR.riskMediumTint,
    textColor: COLOR.riskMediumText,
    labelTh: 'เสี่ยงปานกลาง',
    shortLabelTh: 'ปานกลาง',
    labelEn: 'Medium Risk',
    action: 'เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ',
  },
  [RiskLevel.HIGH]: {
    level: RiskLevel.HIGH,
    minScore: 10,
    maxScore: Infinity,
    color: COLOR.riskHigh,
    bgColor: COLOR.riskHighTint,
    textColor: COLOR.riskHighText,
    labelTh: 'เสี่ยงสูง',
    shortLabelTh: 'สูง',
    labelEn: 'High Risk',
    action: 'ควรประสานส่งต่อทันที!',
  },
};

export const HIGH_RISK_RECOMMENDATION = 'ควรประสานส่งต่อทันที!';

// CPD factor weights — each factor contributes a weighted score
// Total possible score depends on clinical values
export interface CpdFactorWeight {
  name: string;
  nameTh: string;
  evaluate: (value: number) => number;
}

export const CPD_FACTOR_WEIGHTS: Record<string, CpdFactorWeight> = {
  gravida: {
    name: 'gravida',
    nameTh: 'จำนวนครรภ์',
    evaluate: (value: number) => (value === 1 ? 2 : 0),
  },
  ancCount: {
    name: 'ancCount',
    nameTh: 'จำนวนครั้ง ANC',
    evaluate: (value: number) => (value < 4 ? 1.5 : 0),
  },
  gaWeeks: {
    name: 'gaWeeks',
    nameTh: 'อายุครรภ์ (สัปดาห์)',
    evaluate: (value: number) => (value >= 40 ? 1.5 : 0),
  },
  heightCm: {
    name: 'heightCm',
    nameTh: 'ส่วนสูง (ซม.)',
    evaluate: (value: number) => (value < 150 ? 2 : value < 155 ? 1 : 0),
  },
  weightDiffKg: {
    name: 'weightDiffKg',
    nameTh: 'ส่วนต่างน้ำหนัก (กก.)',
    evaluate: (value: number) => (value > 20 ? 2 : value > 15 ? 1 : 0),
  },
  fundalHeightCm: {
    name: 'fundalHeightCm',
    nameTh: 'ยอดมดลูก (ซม.)',
    evaluate: (value: number) => (value > 36 ? 2 : value > 34 ? 1 : 0),
  },
  usWeightG: {
    name: 'usWeightG',
    nameTh: 'น้ำหนักเด็ก U/S (กรัม)',
    evaluate: (value: number) => (value > 3500 ? 2 : value > 3000 ? 1 : 0),
  },
  hematocritPct: {
    name: 'hematocritPct',
    nameTh: 'Hematocrit (%)',
    evaluate: (value: number) => (value < 30 ? 1.5 : 0),
  },
};

export function classifyRiskLevel(score: number): RiskLevel {
  if (score >= 10) return RiskLevel.HIGH;
  if (score >= 5) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

export function getRiskConfig(level: RiskLevel): RiskLevelConfig {
  return RISK_LEVELS[level];
}

/**
 * Single config-derived predicate for "should the high-risk alert fire?".
 * Tracks the HIGH classification boundary (RISK_LEVELS[HIGH].minScore) via
 * classifyRiskLevel so UI call sites never repeat a bare numeric threshold.
 */
export function isHighRisk(score: number): boolean {
  return classifyRiskLevel(score) === RiskLevel.HIGH;
}

/** Maximum contribution of each CPD factor, i.e. the top band of its
 *  `evaluate()` in CPD_FACTOR_WEIGHTS. Test-pinned against evaluate(). */
export const CPD_FACTOR_MAX_SCORES = {
  gravida: 2,
  ancCount: 1.5,
  gaWeeks: 1.5,
  heightCm: 2,
  weightDiffKg: 2,
  fundalHeightCm: 2,
  usWeightG: 2,
  hematocritPct: 1.5,
} as const;

/** Highest possible CPD score (shown as "/ 14.5" next to a patient's score). */
export const CPD_MAX_SCORE = Object.values(CPD_FACTOR_MAX_SCORES).reduce((s, v) => s + v, 0);
