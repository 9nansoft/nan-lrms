// ClinicalData — 8-tile grid of clinical measurements. Redesigned 2026-04-21
// (v3): each metric has a clinical normal band; abnormal / borderline values
// get tinted backgrounds + status badges so the clinician's eye lands on
// the clinically-actionable numbers first.
'use client';

import {
  Activity,
  Calendar,
  Baby,
  Ruler,
  Scale,
  Droplets,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface ClinicalDataProps {
  gravida: number | null;
  gaWeeks: number | null;
  ancCount: number | null;
  heightCm: number | null;
  weightKg?: number | null;
  weightDiffKg: number | null;
  fundalHeightCm: number | null;
  usWeightG: number | null;
  hematocritPct: number | null;
}

type Severity = 'normal' | 'borderline' | 'abnormal' | 'neutral';

function sevColor(s: Severity): string {
  switch (s) {
    case 'abnormal':   return 'var(--risk-high)';
    case 'borderline': return 'var(--risk-medium)';
    case 'normal':     return 'var(--risk-low)';
    default:           return 'var(--accent-navy)';
  }
}

function sevBg(s: Severity): string {
  switch (s) {
    case 'abnormal':   return 'color-mix(in srgb, #ef4444 12%, white)';
    case 'borderline': return 'color-mix(in srgb, #eab308 12%, white)';
    case 'normal':     return 'color-mix(in srgb, #22c55e 8%, white)';
    default:           return 'white';
  }
}

// Clinical thresholds — these mirror the CPD rule set used in the risk
// scorer; duplicated here only for UI severity so the tile can render a
// borderline/abnormal state without importing the full evaluator.
function sevHeight(cm: number | null): Severity {
  if (cm == null) return 'neutral';
  if (cm < 145) return 'abnormal';
  if (cm < 150) return 'borderline';
  return 'normal';
}
function sevWeightGain(diff: number | null): Severity {
  if (diff == null) return 'neutral';
  if (diff > 20) return 'abnormal';
  if (diff > 15) return 'borderline';
  return 'normal';
}
function sevFundal(cm: number | null): Severity {
  if (cm == null) return 'neutral';
  if (cm > 40 || cm < 28) return 'abnormal';
  if (cm > 38) return 'borderline';
  return 'normal';
}
function sevUsWeight(g: number | null): Severity {
  if (g == null) return 'neutral';
  if (g > 4000) return 'abnormal';      // macrosomia
  if (g > 3800) return 'borderline';
  return 'normal';
}
function sevHct(pct: number | null): Severity {
  if (pct == null) return 'neutral';
  if (pct < 27) return 'abnormal';      // severe anemia
  if (pct < 33) return 'borderline';    // mild anemia
  return 'normal';
}
function sevAnc(count: number | null): Severity {
  if (count == null) return 'neutral';
  if (count < 4) return 'abnormal';
  if (count < 8) return 'borderline';
  return 'normal';
}
function sevGa(weeks: number | null): Severity {
  if (weeks == null) return 'neutral';
  if (weeks < 34 || weeks > 41) return 'abnormal';
  if (weeks < 37) return 'borderline';
  return 'normal';
}

function Tile({
  icon,
  label,
  labelEn,
  value,
  unit,
  severity = 'neutral',
  note,
}: {
  icon: ReactNode;
  label: string;
  labelEn: string;
  value: ReactNode;
  unit?: string;
  severity?: Severity;
  note?: string;
}) {
  const c = sevColor(severity);
  const bg = sevBg(severity);
  const showBadge = severity === 'abnormal' || severity === 'borderline';
  return (
    <div
      className="relative flex flex-col gap-0.5 border px-2.5 py-2"
      style={{
        borderColor: 'var(--rule-strong)',
        borderLeft: `3px solid ${c}`,
        background: bg,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1.5" style={{ color: c }}>
          <span className="flex h-3 w-3 items-center justify-center">{icon}</span>
          <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
            {labelEn}
          </span>
        </div>
        {showBadge && (
          <span
            className="inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-white"
            style={{ background: c }}
          >
            <AlertTriangle className="h-2.5 w-2.5" />
            {severity === 'abnormal' ? 'ALERT' : 'WARN'}
          </span>
        )}
        {severity === 'normal' && (
          <span style={{ color: c }}>
            <CheckCircle2 className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span
          className="font-mono text-[20px] font-bold leading-none tabular-nums"
          style={{
            color: severity === 'neutral' ? 'var(--ink-navy)' : c,
            letterSpacing: '-0.02em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[10px] text-[var(--ink-navy-muted)]">{unit}</span>
        )}
      </div>
      <div className="font-mono text-[10px] text-[var(--ink-navy-dim)]">
        {label}
        {note && <span className="ml-1 text-[var(--ink-navy-muted)]">· {note}</span>}
      </div>
    </div>
  );
}

export function ClinicalData({
  gravida,
  gaWeeks,
  ancCount,
  heightCm,
  weightKg,
  weightDiffKg,
  fundalHeightCm,
  usWeightG,
  hematocritPct,
}: ClinicalDataProps) {
  const hasFullWeight =
    weightKg != null && weightDiffKg != null && weightKg > 0 && weightDiffKg > 0;
  const preWeight = hasFullWeight ? weightKg! - weightDiffKg! : null;

  const dash = <span className="text-[var(--ink-navy-muted)]">—</span>;
  const weightSev = sevWeightGain(weightDiffKg);
  const weightColor = sevColor(weightSev);
  const weightBg = sevBg(weightSev);
  const weightShowBadge = weightSev === 'abnormal' || weightSev === 'borderline';

  return (
    <div
      className="rounded-sm border"
      style={{ borderColor: 'var(--rule-strong)' }}
    >
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{
          borderColor: 'var(--rule-strong)',
          background: 'linear-gradient(135deg, var(--accent-navy-soft) 0%, white 60%)',
        }}
      >
        <Activity className="h-4 w-4" style={{ color: 'var(--accent-navy)' }} />
        <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-navy)]">
          ข้อมูลทางคลินิก
        </h3>
      </div>
      <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
        <Tile
          icon={<Activity className="h-3 w-3" />}
          label="ครรภ์ที่"
          labelEn="GRAVIDA"
          value={gravida != null ? `G${gravida}` : dash}
        />
        <Tile
          icon={<Calendar className="h-3 w-3" />}
          label="อายุครรภ์"
          labelEn="GA"
          value={gaWeeks != null ? gaWeeks : dash}
          unit="wk"
          severity={sevGa(gaWeeks)}
          note={
            gaWeeks == null
              ? undefined
              : gaWeeks < 34
                ? 'Very Preterm'
                : gaWeeks < 37
                  ? 'Preterm'
                  : gaWeeks > 41
                    ? 'Post-term'
                    : 'Term'
          }
        />
        <Tile
          icon={<Baby className="h-3 w-3" />}
          label="ฝากครรภ์"
          labelEn="ANC"
          value={ancCount != null ? ancCount : dash}
          unit="ครั้ง"
          severity={sevAnc(ancCount)}
          note={
            ancCount == null
              ? undefined
              : ancCount < 4
                ? 'ต่ำกว่ามาตรฐาน'
                : ancCount < 8
                  ? 'ยังไม่ครบ 8'
                  : 'ครบ'
          }
        />
        <Tile
          icon={<Ruler className="h-3 w-3" />}
          label="ส่วนสูง"
          labelEn="HEIGHT"
          value={heightCm != null ? heightCm : dash}
          unit="ซม."
          severity={sevHeight(heightCm)}
          note={
            heightCm == null
              ? undefined
              : heightCm < 145
                ? 'เสี่ยง CPD'
                : heightCm < 150
                  ? 'ระวัง'
                  : undefined
          }
        />

        {/* Weight-gain — inline expression so the arrow + delta read as one cell */}
        <div
          className="relative flex flex-col gap-0.5 border px-2.5 py-2"
          style={{
            borderColor: 'var(--rule-strong)',
            borderLeft: `3px solid ${weightColor}`,
            background: weightBg,
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1.5" style={{ color: weightColor }}>
              <Scale className="h-3 w-3" />
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em]">
                WEIGHT GAIN
              </span>
            </div>
            {weightShowBadge && weightDiffKg != null && (
              <span
                className="inline-flex items-center gap-0.5 rounded-sm px-1 py-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-white"
                style={{ background: weightColor }}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {weightSev === 'abnormal' ? 'ALERT' : 'WARN'}
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[13px] tabular-nums text-[var(--ink-navy-dim)]">
            {hasFullWeight && preWeight !== null && weightDiffKg != null ? (
              <>
                <span>{preWeight}</span>
                <span className="mx-0.5 text-[var(--ink-navy-muted)]">→</span>
                <span className="font-semibold text-[var(--ink-navy)]">{weightKg}</span>
                <span className="mx-0.5 text-[var(--ink-navy-muted)]">=</span>
                <span className="font-bold" style={{ color: weightColor }}>
                  +{weightDiffKg}
                </span>
                <span className="ml-0.5 text-[10px] text-[var(--ink-navy-muted)]">กก.</span>
              </>
            ) : weightDiffKg != null ? (
              <>
                <span className="font-bold" style={{ color: weightColor }}>
                  +{weightDiffKg}
                </span>
                <span className="ml-0.5 text-[10px] text-[var(--ink-navy-muted)]">กก.</span>
              </>
            ) : (
              dash
            )}
          </div>
          <div className="font-mono text-[10px] text-[var(--ink-navy-dim)]">
            ส่วนต่างน้ำหนัก
            {weightDiffKg != null && weightDiffKg > 20 && (
              <span className="ml-1 text-[var(--ink-navy-muted)]">· เกินเกณฑ์</span>
            )}
          </div>
        </div>

        <Tile
          icon={<Ruler className="h-3 w-3" />}
          label="ยอดมดลูก"
          labelEn="FUNDAL HT."
          value={fundalHeightCm != null ? fundalHeightCm : dash}
          unit="ซม."
          severity={sevFundal(fundalHeightCm)}
        />
        <Tile
          icon={<Baby className="h-3 w-3" />}
          label="น้ำหนักเด็ก U/S"
          labelEn="US WEIGHT"
          value={usWeightG != null ? usWeightG.toLocaleString() : dash}
          unit="ก."
          severity={sevUsWeight(usWeightG)}
          note={
            usWeightG == null
              ? undefined
              : usWeightG > 4000
                ? 'Macrosomia'
                : usWeightG > 3800
                  ? 'LGA'
                  : undefined
          }
        />
        <Tile
          icon={<Droplets className="h-3 w-3" />}
          label="Hematocrit"
          labelEn="HCT"
          value={hematocritPct != null ? hematocritPct : dash}
          unit="%"
          severity={sevHct(hematocritPct)}
          note={
            hematocritPct == null
              ? undefined
              : hematocritPct < 27
                ? 'Severe anemia'
                : hematocritPct < 33
                  ? 'Mild anemia'
                  : undefined
          }
        />
      </div>
    </div>
  );
}
