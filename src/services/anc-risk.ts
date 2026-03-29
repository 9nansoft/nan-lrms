import {
  classifyAncRisk,
  ANC_RISK_CONFIGS,
  type AncRiskInput,
  type AncRiskLevelConfig,
} from '@/config/anc-risk-rules';

export interface AncRiskResult {
  level: import('@/types/domain').AncRiskLevel;
  triggeredRules: string[];
  recommendation: AncRiskLevelConfig;
}

export function evaluateAncRisk(input: AncRiskInput): AncRiskResult {
  const { level, triggeredRules } = classifyAncRisk(input);

  return {
    level,
    triggeredRules,
    recommendation: ANC_RISK_CONFIGS[level],
  };
}
