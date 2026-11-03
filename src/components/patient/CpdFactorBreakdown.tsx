// CpdFactorBreakdown — per-factor contribution to the CPD risk score.
// Half-circle gauge for the total score, tone-coloured factor rows (token
// classes from STATUS_TONE) with an inline value, and a dashed missing-data
// pattern that is visually distinct from "present but 0 contribution". The
// goal is to let a clinician glance at this panel and identify which
// specific factor(s) are driving the risk. Maxima come from config.
'use client';

import { CheckCircle2, AlertTriangle, HelpCircle, Gauge } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { CPD_FACTOR_MAX_SCORES, CPD_FACTOR_WEIGHTS, CPD_MAX_SCORE, RISK_LEVELS } from '@/config/risk-levels';
import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import { RiskLevel } from '@/types/domain';

interface CpdFactorBreakdownProps {
  score: number;
  riskLevel: string; // 'LOW' | 'MEDIUM' | 'HIGH'
  factors: {
    gravida: number | null;
    ancCount: number | null;
    gaWeeks: number | null;
    heightCm: number | null;
    weightDiffKg: number | null;
    fundalHeightCm: number | null;
    usWeightG: number | null;
    hematocritPct: number | null;
  };
  missingFactors: string[];
  calculatedAt: string;
}

const FACTOR_ORDER: (keyof CpdFactorBreakdownProps['factors'])[] = [
  'gravida',
  'ancCount',
  'gaWeeks',
  'heightCm',
  'weightDiffKg',
  'fundalHeightCm',
  'usWeightG',
  'hematocritPct',
];

type FactorSeverity = 'normal' | 'partial' | 'abnormal' | 'missing';

function factorSeverity(
  contribution: number,
  maxScore: number,
  missing: boolean,
): FactorSeverity {
  if (missing) return 'missing';
  if (contribution <= 0) return 'normal';
  if (contribution < maxScore) return 'partial';
  return 'abnormal';
}

const FACTOR_TONE: Record<FactorSeverity, StatusTone> = {
  abnormal: 'danger',
  partial: 'warn',
  missing: 'neutral',
  normal: 'ok',
};

function riskConfig(riskLevel: string) {
  return RISK_LEVELS[riskLevel as RiskLevel] ?? RISK_LEVELS[RiskLevel.LOW];
}

// Semi-circular gauge for total score. Renders a 180° arc with the risk-tone
// fill spanning 0..score/max, plus the numeric score centered inside.
function ScoreGauge({
  score,
  riskLevel,
  maxScore,
}: {
  score: number;
  riskLevel: string;
  maxScore: number;
}) {
  // PGlite NUMERIC → string coercion guard.
  const scoreNum = typeof score === 'number' ? score : Number(score);
  const cfg = riskConfig(riskLevel);
  const pct = Math.min((Number.isFinite(scoreNum) ? scoreNum : 0) / maxScore, 1);

  // Arc parameters
  const size = 140;
  const strokeWidth = 14;
  const cx = size / 2;
  const cy = size / 2 + 8; // push down so label fits
  const radius = (size - strokeWidth) / 2;

  const startAngle = Math.PI; // 180°
  const endAngle = 2 * Math.PI; // 360°
  const sweep = endAngle - startAngle;

  const angleAt = (p: number) => startAngle + sweep * p;

  const polarToCartesian = (angle: number) => {
    return {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  };

  const buildArcPath = (p: number) => {
    if (p <= 0) return '';
    const start = polarToCartesian(startAngle);
    const end = polarToCartesian(angleAt(p));
    const largeArc = p > 0.5 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const trackPath = `M ${polarToCartesian(startAngle).x} ${polarToCartesian(startAngle).y}
     A ${radius} ${radius} 0 1 1 ${polarToCartesian(endAngle).x} ${polarToCartesian(endAngle).y}`;

  return (
    <div className="relative flex shrink-0 flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7 + 8}`}>
        {/* Track */}
        <path
          d={trackPath}
          fill="none"
          stroke={COLOR.border}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Progress */}
        <path
          d={buildArcPath(pct)}
          fill="none"
          stroke={cfg.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Center label — score */}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize={30}
          fontWeight={700}
          fill={COLOR.ink}
          style={{ letterSpacing: '-0.03em' }}
        >
          {Number.isFinite(scoreNum) ? scoreNum.toFixed(scoreNum % 1 === 0 ? 0 : 2) : '—'}
        </text>
        <text
          x={cx}
          y={cy + 14}
          textAnchor="middle"
          fontSize={MIN_TEXT_PX}
          fill={COLOR.inkMuted}
          letterSpacing="0.1em"
        >
          / {maxScore}
        </text>
      </svg>
      <div
        className="mt-1 inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-label font-semibold text-white"
        style={{ backgroundColor: cfg.textColor }}
      >
        <AlertTriangle aria-hidden="true" className="h-3 w-3" />
        {cfg.labelTh}
      </div>
    </div>
  );
}

function FactorRow({
  nameTh,
  contribution,
  maxScore,
  missing,
}: {
  nameTh: string;
  contribution: number;
  maxScore: number;
  missing: boolean;
}) {
  const sev = factorSeverity(contribution, maxScore, missing);
  const t = STATUS_TONE[FACTOR_TONE[sev]];

  const icon =
    sev === 'abnormal' ? <AlertTriangle className="h-3.5 w-3.5" />
    : sev === 'missing' ? <HelpCircle className="h-3.5 w-3.5" />
    : sev === 'normal' ? <CheckCircle2 className="h-3.5 w-3.5" />
    : <AlertTriangle className="h-3.5 w-3.5" />;

  const pct = maxScore > 0 ? Math.min(contribution / maxScore, 1) * 100 : 0;
  const solid = sev !== 'normal' && sev !== 'missing';

  return (
    <div className={cn('flex items-center gap-2 border-l-4 px-2.5 py-1.5', t.accent, t.tint)}>
      <span aria-hidden="true" className={t.text}>
        {icon}
      </span>
      <span className="flex-1 text-caption text-ink">{nameTh}</span>
      {/* Contribution bar — visually encodes how much this factor pushed the
          score toward its maximum contribution (which maps to abnormal). */}
      <div className="relative h-2 w-24 shrink-0 overflow-hidden rounded-full bg-border">
        <div
          className={cn('absolute left-0 top-0 h-full transition-all', t.solid)}
          style={{ width: missing ? 0 : `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          'inline-flex w-16 shrink-0 items-center justify-end rounded-full px-1.5 py-0.5 text-caption font-semibold tabular-nums',
          solid ? cn(t.solid, 'text-white') : t.text,
        )}
      >
        {missing ? '—' : `+${contribution}/${maxScore}`}
      </span>
    </div>
  );
}

export function CpdFactorBreakdown({
  score,
  riskLevel,
  factors,
  missingFactors,
  calculatedAt,
}: CpdFactorBreakdownProps) {
  const missingCount = missingFactors.length;

  return (
    <div className="rounded-2xl border border-border bg-surface-card">
      {/* Header strip with gauge on the right */}
      <div className="flex items-center gap-3 border-b border-border bg-brand-soft/40 px-3 py-2">
        <Gauge aria-hidden="true" className="h-4 w-4 text-brand" />
        <div className="flex-1">
          <h3 className="text-body-lg text-ink">วิเคราะห์ปัจจัยเสี่ยง CPD</h3>
          <p className="text-caption text-ink-muted">
            คะแนนรวม {Number(score)} / {CPD_MAX_SCORE}
          </p>
        </div>
        {missingCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-card px-2 py-0.5 text-caption font-semibold text-ink-muted">
            <HelpCircle aria-hidden="true" className="h-3 w-3" />
            {missingCount} ไม่มีข้อมูล
          </span>
        )}
      </div>

      {/* Gauge + legend row */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-3 py-3">
        <ScoreGauge score={score} riskLevel={riskLevel} maxScore={CPD_MAX_SCORE} />
        <div className="flex flex-1 flex-wrap gap-3 text-caption">
          <LegendSwatch color={COLOR.riskLow} label="ปกติ · 0 คะแนน" />
          <LegendSwatch color={COLOR.riskMedium} label="บางส่วน · 0 < คะแนน < max" />
          <LegendSwatch color={COLOR.riskHigh} label="ผิดปกติเต็ม · max คะแนน" />
          <LegendSwatch color={COLOR.inkSubtle} label="ไม่มีข้อมูล" dashed />
        </div>
      </div>

      {/* Factor list — dense, colored rows */}
      <div className="flex flex-col gap-0.5 p-2">
        {FACTOR_ORDER.map((key) => {
          const factorConfig = CPD_FACTOR_WEIGHTS[key];
          const maxScore = CPD_FACTOR_MAX_SCORES[key];
          const isMissing = missingFactors.includes(key);
          // The API returns the CONTRIBUTION (post-evaluate), not the raw
          // clinical value, in `factors[key]`. See services/sync/cpd-persist.ts
          // where the `factor_*` columns are written from
          // `result.factorScores.*`. Trust what the API gave us.
          const stored = factors[key];
          const contribution = !isMissing && stored !== null ? Number(stored) : 0;
          return (
            <FactorRow
              key={key}
              nameTh={factorConfig.nameTh}
              contribution={contribution}
              maxScore={maxScore}
              missing={isMissing}
            />
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-border px-3 py-1.5 text-caption text-ink-muted">
        <span>คำนวณเมื่อ {formatRelativeTime(calculatedAt)}</span>
        <span>คะแนน CPD · จังหวัดน่าน</span>
      </div>
    </div>
  );
}

function LegendSwatch({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
      <span
        className="inline-block h-2.5 w-4"
        style={{
          background: dashed ? undefined : color,
          borderLeft: dashed ? `3px dashed ${color}` : `3px solid ${color}`,
        }}
      />
      {label}
    </span>
  );
}
