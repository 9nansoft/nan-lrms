import { describe, it, expect } from 'vitest';
import {
  ANC_RISK_RULES,
  type AncRiskInput,
  ANC_RISK_LEVEL_ORDER,
  ANC_RISK_CONFIGS,
  classifyAncRisk,
} from '@/config/anc-risk-rules';
import { AncRiskLevel } from '@/types/domain';

const baseInput: AncRiskInput = {
  age: 25, heightCm: 160, prePregnancyBmi: 22, gravida: 2,
  bpSystolic: 120, bpDiastolic: 80, o2Sat: 98, hct: 36, hb: 12,
  hosxpRiskIds: [], classifyingItems: [],
  rhNegative: false, hbsAgPositive: false, syphilisPositive: false,
  hivPositive: false, thalassemiaDisease: false, niptHighRisk: false,
};

describe('ANC Risk Rules Configuration', () => {
  it('exports rules array with at least 20 rules', () => {
    expect(ANC_RISK_RULES.length).toBeGreaterThanOrEqual(20);
  });

  it('every rule has required fields', () => {
    for (const rule of ANC_RISK_RULES) {
      expect(rule.id).toBeTruthy();
      expect(['HR1', 'HR2', 'HR3']).toContain(rule.level);
      expect(rule.labelTh).toBeTruthy();
      expect(rule.labelEn).toBeTruthy();
      expect(['computed', 'hosxp_risk', 'hosxp_classifying', 'lab']).toContain(rule.source);
      expect(typeof rule.evaluate).toBe('function');
    }
  });

  describe('HR1 rules', () => {
    it('hr1_age triggers for age < 17', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_age')!;
      expect(rule.evaluate({ ...baseInput, age: 16 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, age: 17 })).toBe(false);
    });

    it('hr1_age triggers for age >= 35', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_age')!;
      expect(rule.evaluate({ ...baseInput, age: 35 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, age: 34 })).toBe(false);
    });

    it('hr1_height triggers for height < 145', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_height')!;
      expect(rule.evaluate({ ...baseInput, heightCm: 144 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, heightCm: 145 })).toBe(false);
    });

    it('hr1_bmi_low triggers for BMI < 18.5', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_bmi_low')!;
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 18 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 18.5 })).toBe(false);
    });

    it('hr1_bmi_high triggers for BMI >= 23 and < 30', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_bmi_high')!;
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 23 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 29.9 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 30 })).toBe(false);
    });

    it('hr1_o2sat triggers for O2sat < 95', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_o2sat')!;
      expect(rule.evaluate({ ...baseInput, o2Sat: 94 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, o2Sat: 95 })).toBe(false);
    });
  });

  describe('HR2 rules', () => {
    it('hr2_bmi triggers for BMI 30-40', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr2_bmi')!;
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 30 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 39.9 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 40 })).toBe(false);
    });

    it('hr2_bp triggers for diastolic >= 90 or systolic >= 140', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr2_bp')!;
      expect(rule.evaluate({ ...baseInput, bpDiastolic: 90 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, bpSystolic: 140 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, bpSystolic: 139, bpDiastolic: 89 })).toBe(false);
    });

    it('hr2_gravida triggers for gravida >= 5', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr2_gravida')!;
      expect(rule.evaluate({ ...baseInput, gravida: 5 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, gravida: 4 })).toBe(false);
    });

    it('hr2_hiv triggers for HIV positive', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr2_hiv')!;
      expect(rule.evaluate({ ...baseInput, hivPositive: true })).toBe(true);
      expect(rule.evaluate({ ...baseInput, hivPositive: false })).toBe(false);
    });
  });

  describe('HR3 rules', () => {
    it('hr3_bmi triggers for BMI >= 40', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr3_bmi')!;
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 40 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, prePregnancyBmi: 39.9 })).toBe(false);
    });

    it('hr3_anemia triggers for Hct < 28 or Hb < 9', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr3_anemia')!;
      expect(rule.evaluate({ ...baseInput, hct: 27 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, hb: 8.5 })).toBe(true);
      expect(rule.evaluate({ ...baseInput, hct: 28, hb: 9 })).toBe(false);
    });

    it('hr3_nipt triggers for NIPT high risk', () => {
      const rule = ANC_RISK_RULES.find((r) => r.id === 'hr3_nipt')!;
      expect(rule.evaluate({ ...baseInput, niptHighRisk: true })).toBe(true);
      expect(rule.evaluate({ ...baseInput, niptHighRisk: false })).toBe(false);
    });
  });

  describe('ANC_RISK_LEVEL_ORDER', () => {
    it('orders HR3 > HR2 > HR1 > LOW', () => {
      expect(ANC_RISK_LEVEL_ORDER[AncRiskLevel.HR3]).toBeGreaterThan(ANC_RISK_LEVEL_ORDER[AncRiskLevel.HR2]);
      expect(ANC_RISK_LEVEL_ORDER[AncRiskLevel.HR2]).toBeGreaterThan(ANC_RISK_LEVEL_ORDER[AncRiskLevel.HR1]);
      expect(ANC_RISK_LEVEL_ORDER[AncRiskLevel.HR1]).toBeGreaterThan(ANC_RISK_LEVEL_ORDER[AncRiskLevel.LOW]);
    });
  });

  describe('ANC_RISK_CONFIGS', () => {
    it('has Thai labels and colors for all 4 levels', () => {
      for (const level of [AncRiskLevel.LOW, AncRiskLevel.HR1, AncRiskLevel.HR2, AncRiskLevel.HR3]) {
        const config = ANC_RISK_CONFIGS[level];
        expect(config.labelTh).toBeTruthy();
        expect(config.labelEn).toBeTruthy();
        expect(config.color).toBeTruthy();
        expect(config.facilityTh).toBeTruthy();
        expect(config.providerTh).toBeTruthy();
      }
    });
  });

  describe('classifyAncRisk', () => {
    it('returns LOW when no risk factors', () => {
      const result = classifyAncRisk(baseInput);
      expect(result.level).toBe(AncRiskLevel.LOW);
      expect(result.triggeredRules).toEqual([]);
    });

    it('returns highest triggered level (HR3 > HR2 > HR1)', () => {
      const result = classifyAncRisk({ ...baseInput, age: 36, hivPositive: true, prePregnancyBmi: 42 });
      expect(result.level).toBe(AncRiskLevel.HR3);
      expect(result.triggeredRules).toContain('hr1_age');
      expect(result.triggeredRules).toContain('hr2_hiv');
      expect(result.triggeredRules).toContain('hr3_bmi');
    });
  });
});
