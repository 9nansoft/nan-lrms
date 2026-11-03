// T039: CpdBadge component — pill showing CPD score with risk color (rendered via RiskChip)
'use client';

import { RiskLevel } from '@/types/domain';
import { RISK_LEVELS, HIGH_RISK_RECOMMENDATION } from '@/config/risk-levels';
import { RiskChip } from '@/components/shared/RiskChip';

interface CpdBadgeProps {
  score: number;
  riskLevel: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function CpdBadge({ score, riskLevel, size = 'md', className }: CpdBadgeProps) {
  const config = RISK_LEVELS[riskLevel];
  const isHigh = riskLevel === RiskLevel.HIGH;
  const title = isHigh ? HIGH_RISK_RECOMMENDATION : config.labelTh;

  return (
    <RiskChip level={riskLevel} score={score} size={size} title={title} className={className}>
      {score}
    </RiskChip>
  );
}
