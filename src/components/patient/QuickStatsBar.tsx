// QuickStatsBar — 6-tile horizontal snapshot for a labor patient.
// Redesigned 2026-04-21 (v3): each tile has a tinted background + top accent
// band in its semantic color, so the eye can scan severity at a glance
// (e.g. LAST VITAL missing → full red tile, CERVIX in transition → navy
// accent, normal demographics → soft slate).
'use client';

import { useMemo } from 'react';
import { Baby, Calendar, Clock, Activity, Timer, HeartPulse } from 'lucide-react';
import type { ReactNode } from 'react';

interface QuickStatsBarProps {
  age: number;
  gravida: number | null;
  gaWeeks: number | null;
  ancCount: number | null;
  admitDate: string;
  laborStatus: string;
  currentDilationCm: number | null;
  latestVitalAt: string | null;
}

function formatLaborDuration(admitDate: string): string {
  const now = new Date();
  const admit = new Date(admitDate);
  const diffMs = now.getTime() - admit.getTime();
  if (diffMs < 0) return '-';
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days}ว ${hours}ชม` : `${days}ว`;
  if (hours > 0) return minutes > 0 ? `${hours}ชม ${minutes}น` : `${hours}ชม`;
  return `${minutes}น`;
}

function getVitalRelativeInfo(latestVitalAt: string | null): {
  text: string;
  color: string;
  severity: Severity;
} {
  if (!latestVitalAt) return { text: 'ไม่มีข้อมูล', color: 'var(--risk-high)', severity: 'abnormal' };
  const now = new Date();
  const vitalTime = new Date(latestVitalAt);
  const diffMs = now.getTime() - vitalTime.getTime();
  if (diffMs < 0) return { text: 'เมื่อสักครู่', color: 'var(--risk-low)', severity: 'normal' };
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffMinutes < 15)
    return {
      text: diffMinutes < 1 ? 'เมื่อสักครู่' : `${diffMinutes}น ที่แล้ว`,
      color: 'var(--risk-low)',
      severity: 'normal',
    };
  if (diffMinutes < 60)
    return { text: `${diffMinutes}น ที่แล้ว`, color: 'var(--risk-medium)', severity: 'borderline' };
  if (diffHours < 24)
    return { text: `${diffHours}ชม ที่แล้ว`, color: 'var(--risk-high)', severity: 'abnormal' };
  const diffDays = Math.floor(diffHours / 24);
  return { text: `${diffDays}ว ที่แล้ว`, color: 'var(--risk-high)', severity: 'abnormal' };
}

type Severity = 'normal' | 'borderline' | 'abnormal';

function getDilation(cm: number | null): { color: string; phase: string; severity: Severity } {
  if (cm === null) return { color: 'var(--ink-navy-muted)', phase: 'รอประเมิน', severity: 'normal' };
  if (cm < 4) return { color: 'var(--accent-navy)', phase: 'Latent', severity: 'normal' };
  if (cm <= 7) return { color: '#14b8a6', phase: 'Active', severity: 'borderline' };
  return { color: 'var(--risk-medium)', phase: 'Transition', severity: 'borderline' };
}

// Color helpers — `color-mix` gives us a consistent "tinted" background at a
// controlled saturation without manually specifying rgba for every palette.
function tintBg(color: string, pct = 10): string {
  return `color-mix(in srgb, ${color} ${pct}%, white)`;
}

interface StatItemProps {
  icon: ReactNode;
  labelTh: string;
  labelEn: string;
  value: ReactNode;
  unit?: string;
  color?: string;
  sub?: string;
  tintPct?: number;
  isLast?: boolean;
}

function StatItem({
  icon,
  labelTh,
  labelEn,
  value,
  unit,
  color = 'var(--accent-navy)',
  sub,
  tintPct = 8,
  isLast,
}: StatItemProps) {
  return (
    <div
      className="relative flex flex-col gap-1 px-4 py-3"
      style={{
        background: tintBg(color, tintPct),
        borderRight: isLast ? undefined : '1px solid var(--rule-strong)',
      }}
    >
      {/* Top accent band */}
      <span
        aria-hidden="true"
        className="absolute top-0 left-0 h-[3px]"
        style={{ width: '100%', background: color, opacity: 0.8 }}
      />
      <div
        className="flex items-center gap-1.5"
        style={{ color }}
      >
        <span className="flex h-3.5 w-3.5 items-center justify-center">{icon}</span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
          {labelEn}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className="font-mono text-[24px] font-bold leading-none tabular-nums"
          style={{ color, letterSpacing: '-0.025em' }}
        >
          {value}
        </span>
        {unit && (
          <span className="font-mono text-[11px]" style={{ color: 'var(--ink-navy-muted)' }}>
            {unit}
          </span>
        )}
      </div>
      <div className="font-mono text-[10px]" style={{ color: 'var(--ink-navy-dim)' }}>
        {labelTh}
        {sub && <span className="ml-1.5 text-[var(--ink-navy-muted)]">· {sub}</span>}
      </div>
    </div>
  );
}

export function QuickStatsBar({
  age,
  gravida,
  gaWeeks,
  admitDate,
  currentDilationCm,
  latestVitalAt,
}: QuickStatsBarProps) {
  const laborDuration = useMemo(() => formatLaborDuration(admitDate), [admitDate]);
  const vitalInfo = useMemo(() => getVitalRelativeInfo(latestVitalAt), [latestVitalAt]);
  const dilation = useMemo(() => getDilation(currentDilationCm), [currentDilationCm]);

  // GA color band: term (≥37) = green, preterm = amber, <34 = red, post-term >41 = red.
  const gaColor =
    gaWeeks == null
      ? 'var(--ink-navy-muted)'
      : gaWeeks < 34 || gaWeeks > 41
        ? 'var(--risk-high)'
        : gaWeeks < 37
          ? 'var(--risk-medium)'
          : 'var(--risk-low)';

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
    >
      <StatItem
        icon={<Baby className="h-3.5 w-3.5" />}
        labelTh="อายุ"
        labelEn="AGE"
        value={age}
        unit="ปี"
        color="var(--accent-navy)"
      />
      <StatItem
        icon={<Activity className="h-3.5 w-3.5" />}
        labelTh="ครรภ์ที่"
        labelEn="GRAVIDA"
        value={gravida !== null ? `G${gravida}` : '—'}
        color="var(--accent-navy)"
      />
      <StatItem
        icon={<Calendar className="h-3.5 w-3.5" />}
        labelTh="อายุครรภ์"
        labelEn="GA"
        value={gaWeeks !== null ? gaWeeks : '—'}
        unit="wk"
        color={gaColor}
        sub={
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
      <StatItem
        icon={<Timer className="h-3.5 w-3.5" />}
        labelTh="ระยะเวลาในห้องคลอด"
        labelEn="LABOR TIME"
        value={laborDuration}
        color="var(--accent-navy)"
      />
      <StatItem
        icon={<Clock className="h-3.5 w-3.5" />}
        labelTh="ปากมดลูก"
        labelEn="CERVIX"
        value={currentDilationCm !== null ? currentDilationCm : '—'}
        unit="ซม."
        color={dilation.color}
        sub={dilation.phase}
        tintPct={currentDilationCm !== null ? 12 : 6}
      />
      <StatItem
        icon={<HeartPulse className="h-3.5 w-3.5" />}
        labelTh="Vital ล่าสุด"
        labelEn="LAST VITAL"
        value={vitalInfo.text}
        color={vitalInfo.color}
        tintPct={vitalInfo.severity === 'abnormal' ? 18 : vitalInfo.severity === 'borderline' ? 12 : 8}
        sub={vitalInfo.severity === 'abnormal' ? 'STALE' : undefined}
        isLast
      />
    </div>
  );
}
