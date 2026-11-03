// src/components/patient/ReferralBanner.tsx
// Persistent referral recommendation for MEDIUM / HIGH CPD risk. Colours come
// from RISK_LEVELS (tint background, marker accent, AA text); copy unchanged.
'use client';

import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { RiskLevel } from '@/types/domain';
import { RISK_LEVELS } from '@/config/risk-levels';

interface ReferralBannerProps {
  score: number;
  riskLevel: RiskLevel;
  recommendation: string;
}

const CTA: Record<'MEDIUM' | 'HIGH', { label: string; pulse: boolean }> = {
  MEDIUM: { label: 'เฝ้าระวังใกล้ชิด · เตรียมพร้อมส่งต่อ', pulse: false },
  HIGH: { label: 'ควรประสานส่งต่อทันที', pulse: true },
};

export function ReferralBanner({ score, riskLevel, recommendation }: ReferralBannerProps) {
  if (riskLevel === RiskLevel.LOW) return null;
  const cfg = RISK_LEVELS[riskLevel];
  const cta = CTA[riskLevel as 'MEDIUM' | 'HIGH'];
  return (
    <div
      role="alert"
      aria-label={`${cfg.labelTh} — ${cta.label}`}
      className="flex flex-wrap items-center gap-4 border-l-4 px-4 py-3 md:px-6 print:hidden"
      style={{ backgroundColor: cfg.bgColor, borderLeftColor: cfg.color }}
    >
      <div className="flex shrink-0 items-center gap-2.5">
        {cta.pulse && (
          <span className="relative flex h-3 w-3">
            <span
              className="absolute inline-flex h-full w-full rounded-full opacity-75 motion-safe:animate-ping"
              style={{ backgroundColor: cfg.color }}
            />
            <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
          </span>
        )}
        <AlertTriangle aria-hidden="true" className="h-6 w-6" style={{ color: cfg.color }} />
      </div>
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-card text-title tabular-nums"
        style={{ color: cfg.textColor }}
        aria-label={`คะแนน CPD ${score}`}
      >
        {score}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body font-semibold" style={{ color: cfg.textColor }}>
          {cta.label}
        </span>
        <span className="text-caption text-ink-muted">
          {cfg.labelTh} · {recommendation}
        </span>
      </div>
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-label text-white"
        style={{ backgroundColor: cfg.textColor }}
      >
        <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5" />
        {cfg.labelTh}
      </span>
    </div>
  );
}
