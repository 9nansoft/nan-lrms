// ANC risk chip — renders through the shared RiskChip. Used by the referrals
// board (via components/referrals/chips) and the pregnancies board.
'use client';

import { RiskChip } from '@/components/shared/RiskChip';
import { ANC_RISK_LABEL_TH, ANC_TO_RISK_LEVEL } from '@/config/anc-risk-display';

export function AncRiskChip({ level }: { level: string }) {
  const mapped = ANC_TO_RISK_LEVEL[level];
  if (!mapped) {
    // Unknown/legacy code: neutral chip, still labelled.
    return (
      <span
        data-risk={level}
        role="status"
        aria-label={level}
        className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-caption font-semibold text-ink-muted"
      >
        {level}
      </span>
    );
  }
  return (
    <RiskChip level={mapped} size="sm" label={ANC_RISK_LABEL_TH[level] ?? level} data-risk={level}>
      {level}
    </RiskChip>
  );
}
