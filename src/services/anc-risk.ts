import { AncRiskLevel } from '@/types/domain';
import {
  ANC_RISK_RULES,
  ANC_RISK_LEVEL_ORDER,
  ANC_RISK_CONFIGS,
  type AncRiskInput,
  type AncRiskLevelConfig,
} from '@/config/anc-risk-rules';

export interface AncRiskResult {
  level: AncRiskLevel;
  triggeredRules: string[];
  recommendation: AncRiskLevelConfig;
}

export function evaluateAncRisk(input: AncRiskInput): AncRiskResult {
  const triggeredRules: string[] = [];
  let highestLevel = AncRiskLevel.LOW;

  for (const rule of ANC_RISK_RULES) {
    if (rule.evaluate(input)) {
      triggeredRules.push(rule.id);
      const ruleLevel = AncRiskLevel[rule.level as keyof typeof AncRiskLevel];
      if (ANC_RISK_LEVEL_ORDER[ruleLevel] > ANC_RISK_LEVEL_ORDER[highestLevel]) {
        highestLevel = ruleLevel;
      }
    }
  }

  return {
    level: highestLevel,
    triggeredRules,
    recommendation: ANC_RISK_CONFIGS[highestLevel],
  };
}
