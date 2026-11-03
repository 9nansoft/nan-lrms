// T040: RiskIndicator — colored dot + Thai risk label (rendered via RiskChip)
'use client';

import { RiskLevel } from '@/types/domain';
import { RiskChip } from '@/components/shared/RiskChip';

interface RiskIndicatorProps {
  riskLevel: RiskLevel;
  pulse?: boolean;
  className?: string;
}

export function RiskIndicator({ riskLevel, pulse = false, className }: RiskIndicatorProps) {
  return <RiskChip level={riskLevel} variant="dot" pulse={pulse} className={className} />;
}
