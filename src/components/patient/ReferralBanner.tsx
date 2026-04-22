// ReferralBanner — persistent banner showing referral recommendation for
// MEDIUM / HIGH CPD risk. Redesigned 2026-04-21 (v3): full-width strip with
// risk-colored left accent, pulsing dot + icon cluster, large actionable
// headline, and a separate CTA chip pointing to the recommended facility.
'use client';

import { AlertTriangle, ArrowRightLeft } from 'lucide-react';
import { RiskLevel } from '@/types/domain';
import { RISK_LEVELS } from '@/config/risk-levels';

interface ReferralBannerProps {
  score: number;
  riskLevel: RiskLevel;
  recommendation: string;
}

interface BannerStyle {
  bg: string;
  accent: string;
  headline: string;
  sub: string;
  scoreBg: string;
  scoreFg: string;
  pulse: boolean;
  ctaLabel: string;
}

const BANNER_STYLES: Record<'MEDIUM' | 'HIGH', BannerStyle> = {
  MEDIUM: {
    bg: 'linear-gradient(90deg, color-mix(in srgb, #eab308 14%, white), white)',
    accent: '#eab308',
    headline: '#854d0e',
    sub: '#a16207',
    scoreBg: '#fde68a',
    scoreFg: '#78350f',
    pulse: false,
    ctaLabel: 'เฝ้าระวังใกล้ชิด · เตรียมพร้อมส่งต่อ',
  },
  HIGH: {
    bg: 'linear-gradient(90deg, color-mix(in srgb, #ef4444 16%, white), white)',
    accent: '#dc2626',
    headline: '#7f1d1d',
    sub: '#b91c1c',
    scoreBg: '#fecaca',
    scoreFg: '#7f1d1d',
    pulse: true,
    ctaLabel: 'ควรประสานส่งต่อทันที',
  },
};

export function ReferralBanner({ score, riskLevel, recommendation }: ReferralBannerProps) {
  if (riskLevel === RiskLevel.LOW) return null;

  const config = RISK_LEVELS[riskLevel];
  const style = BANNER_STYLES[riskLevel as 'MEDIUM' | 'HIGH'];

  return (
    <div
      className="flex items-center gap-4 px-6 py-3 print:hidden"
      role="alert"
      aria-label={`${config.labelTh} — ${style.ctaLabel}`}
      style={{
        background: style.bg,
        borderLeft: `4px solid ${style.accent}`,
      }}
    >
      {/* Pulsing dot + warning icon cluster */}
      <div className="flex shrink-0 items-center gap-2.5">
        {style.pulse && (
          <span className="relative flex h-3 w-3">
            <span
              className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
              style={{ background: style.accent }}
            />
            <span
              className="relative inline-flex h-3 w-3 rounded-full"
              style={{ background: style.accent }}
            />
          </span>
        )}
        <AlertTriangle className="h-6 w-6" style={{ color: style.accent }} />
      </div>

      {/* Score circle */}
      <span
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-mono text-[18px] font-bold shadow-[inset_0_0_0_2px_rgba(255,255,255,0.6)]"
        style={{
          background: style.scoreBg,
          color: style.scoreFg,
        }}
        aria-label={`CPD Score ${score}`}
      >
        {score}
      </span>

      {/* Headline + sub */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className="text-[15px] font-bold leading-tight"
          style={{ color: style.headline, letterSpacing: '-0.005em' }}
        >
          {style.ctaLabel}
        </span>
        <span className="text-[12px] leading-tight" style={{ color: style.sub }}>
          {config.labelTh} · {recommendation}
        </span>
      </div>

      {/* Risk level badge */}
      <span
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono text-[11px] font-bold tracking-[0.1em] text-white"
        style={{ background: style.accent }}
      >
        <ArrowRightLeft className="h-3 w-3" />
        {config.labelTh.toUpperCase()}
      </span>
    </div>
  );
}
