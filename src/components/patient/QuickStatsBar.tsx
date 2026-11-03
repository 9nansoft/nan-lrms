// QuickStatsBar — six-tile snapshot for a labor patient, on the shared KpiGrid
// (sub-project 3). Each tile has a status-coloured left marker so severity
// scans at a glance; tones come from STATUS_TONE, cut-offs are unchanged.
'use client';

import { useMemo } from 'react';
import { Baby, Calendar, Clock, Activity, Timer, HeartPulse } from 'lucide-react';
import type { ReactNode } from 'react';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import { GA_TERM_LABEL_TH, GA_TERM_TONE, LABOUR_PHASE_LABEL_TH, classifyGaTerm } from '@/config/obstetric-display';
import { cn } from '@/lib/utils';

interface QuickStatsBarProps {
  age: number;
  gravida: number | null;
  para?: number | null;
  abortion?: number | null;
  livingChildren?: number | null;
  gaWeeks: number | null;
  gaDay?: number | null;
  ancCount: number | null;
  admitDate: string;
  laborStatus: string;
  currentDilationCm: number | null;
  latestVitalAt: string | null;
}

// Render G_P_A_L formula. Falls back to "G3" when only gravida is known so
// behavior is back-compat with older rows that lack the P/A/L fields.
function formatGpal(
  g: number | null,
  p: number | null | undefined,
  a: number | null | undefined,
  l: number | null | undefined,
): string {
  if (g == null) return '—';
  const parts = [`G${g}`];
  if (p != null) parts.push(`P${p}`);
  if (a != null) parts.push(`A${a}`);
  if (l != null) parts.push(`L${l}`);
  return parts.join(' ');
}

// "GA 38⁺⁴" if both weeks and day; just "38" otherwise.
function formatGa(weeks: number | null, day: number | null | undefined): string {
  if (weeks == null) return '—';
  if (day != null && day > 0) return `${weeks}⁺${day}`;
  return String(weeks);
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
  tone: StatusTone;
  severity: Severity;
} {
  if (!latestVitalAt) return { text: 'ไม่มีข้อมูล', tone: 'danger', severity: 'abnormal' };
  const now = new Date();
  const vitalTime = new Date(latestVitalAt);
  const diffMs = now.getTime() - vitalTime.getTime();
  if (diffMs < 0) return { text: 'เมื่อสักครู่', tone: 'ok', severity: 'normal' };
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffMinutes < 15)
    return {
      text: diffMinutes < 1 ? 'เมื่อสักครู่' : `${diffMinutes}น ที่แล้ว`,
      tone: 'ok',
      severity: 'normal',
    };
  if (diffMinutes < 60) return { text: `${diffMinutes}น ที่แล้ว`, tone: 'warn', severity: 'borderline' };
  if (diffHours < 24) return { text: `${diffHours}ชม ที่แล้ว`, tone: 'danger', severity: 'abnormal' };
  const diffDays = Math.floor(diffHours / 24);
  return { text: `${diffDays}ว ที่แล้ว`, tone: 'danger', severity: 'abnormal' };
}

type Severity = 'normal' | 'borderline' | 'abnormal';

function getDilation(cm: number | null): { tone: StatusTone; phase: string } {
  if (cm === null) return { tone: 'neutral', phase: 'รอประเมิน' };
  if (cm < 4) return { tone: 'brand', phase: LABOUR_PHASE_LABEL_TH.latent };
  if (cm <= 7) return { tone: 'brand', phase: LABOUR_PHASE_LABEL_TH.active };
  return { tone: 'warn', phase: LABOUR_PHASE_LABEL_TH.transition };
}

interface StatItemProps {
  icon: ReactNode;
  labelTh: string;
  value: ReactNode;
  unit?: string;
  tone: StatusTone;
  sub?: string;
}

function StatItem({ icon, labelTh, value, unit, tone, sub }: StatItemProps) {
  const valueClass = STATUS_TONE[tone].text;
  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-col gap-1 rounded-2xl border border-border border-l-4 bg-surface-card px-4 py-3',
        STATUS_TONE[tone].accent,
      )}
    >
      <div className="flex items-center gap-1.5 text-label text-ink-muted">
        <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center">
          {icon}
        </span>
        {labelTh}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('whitespace-nowrap text-title tabular-nums', valueClass)}>{value}</span>
        {unit && <span className="text-caption text-ink-muted">{unit}</span>}
      </div>
      {sub && (
        <div className="text-caption text-ink-muted">
          <span>· {sub}</span>
        </div>
      )}
    </div>
  );
}

export function QuickStatsBar({
  age,
  gravida,
  para,
  abortion,
  livingChildren,
  gaWeeks,
  gaDay,
  admitDate,
  currentDilationCm,
  latestVitalAt,
}: QuickStatsBarProps) {
  const laborDuration = useMemo(() => formatLaborDuration(admitDate), [admitDate]);
  const vitalInfo = useMemo(() => getVitalRelativeInfo(latestVitalAt), [latestVitalAt]);
  const dilation = useMemo(() => getDilation(currentDilationCm), [currentDilationCm]);

  // GA band and its tone both come from classifyGaTerm (one set of cut-offs).
  const gaTerm = classifyGaTerm(gaWeeks);
  const gaTone: StatusTone = gaTerm ? GA_TERM_TONE[gaTerm] : 'neutral';

  return (
    <KpiGrid min="md">
      <StatItem icon={<Baby className="h-3.5 w-3.5" />} labelTh="อายุ" value={age} unit="ปี" tone="brand" />
      <StatItem
        icon={<Activity className="h-3.5 w-3.5" />}
        labelTh="G P A L"
        value={formatGpal(gravida, para, abortion, livingChildren)}
        tone="brand"
      />
      <StatItem
        icon={<Calendar className="h-3.5 w-3.5" />}
        labelTh="อายุครรภ์"
        value={formatGa(gaWeeks, gaDay)}
        unit="สัปดาห์"
        tone={gaTone}
        sub={gaTerm ? GA_TERM_LABEL_TH[gaTerm] : undefined}
      />
      <StatItem
        icon={<Timer className="h-3.5 w-3.5" />}
        labelTh="ระยะเวลาในห้องคลอด"
        value={laborDuration}
        tone="brand"
      />
      <StatItem
        icon={<Clock className="h-3.5 w-3.5" />}
        labelTh="ปากมดลูก"
        value={currentDilationCm !== null ? currentDilationCm : '—'}
        unit="ซม."
        tone={dilation.tone}
        sub={dilation.phase}
      />
      <StatItem
        icon={<HeartPulse className="h-3.5 w-3.5" />}
        labelTh="สัญญาณชีพล่าสุด"
        value={vitalInfo.text}
        tone={vitalInfo.tone}
        sub={vitalInfo.severity === 'abnormal' ? 'ข้อมูลเก่า' : undefined}
      />
    </KpiGrid>
  );
}
