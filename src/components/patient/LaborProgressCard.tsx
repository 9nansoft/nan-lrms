// LaborProgressCard — visual summary of labor progress with cervix dilation and phases
'use client';

import { useMemo } from 'react';
import { Activity } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PartogramEntry {
  measuredAt: string;
  dilationCm: number;
  alertLineCm: number | null;
  actionLineCm: number | null;
}

interface ContractionEntry {
  measuredAt: string;
  intervalMin: number | null;
  durationSec: number | null;
  intensity: 'MILD' | 'MODERATE' | 'STRONG';
}

interface LaborProgressCardProps {
  admitDate: string;
  laborStatus: string; // 'ACTIVE' | 'DELIVERED' | 'TRANSFERRED'
  partogramEntries: PartogramEntry[] | null;
  contractions: ContractionEntry[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHASE_CONFIG = {
  LATENT: {
    label: 'Latent Phase (ระยะแฝง)',
    color: '#94a3b8',
  },
  ACTIVE: {
    label: 'Active Phase (ระยะเร่ง)',
    color: '#14b8a6',
  },
  TRANSITION: {
    label: 'Transition (ระยะเปลี่ยนผ่าน)',
    color: '#f59e0b',
  },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

const INTENSITY_LABELS: Record<string, string> = {
  MILD: 'เบา',
  MODERATE: 'ปานกลาง',
  STRONG: 'รุนแรง',
};

const INTENSITY_STYLES: Record<string, string> = {
  MILD: 'bg-slate-100 text-slate-600',
  MODERATE: 'bg-amber-50 text-amber-700',
  STRONG: 'bg-red-50 text-red-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getPhase(cm: number): Phase {
  if (cm <= 3) return 'LATENT';
  if (cm <= 7) return 'ACTIVE';
  return 'TRANSITION';
}

/**
 * Build a gradient that fills the progress bar with phase-appropriate colors
 * up to the current dilation, leaving the rest transparent (track shows through).
 */
function buildBarGradient(cm: number): string {
  const pct = Math.min(Math.max(cm / 10, 0), 1) * 100;

  // Build color stops for the filled region
  const stops: string[] = [];

  if (cm <= 3) {
    // Entirely latent
    stops.push(`${PHASE_CONFIG.LATENT.color} 0%`);
    stops.push(`${PHASE_CONFIG.LATENT.color} ${pct}%`);
  } else if (cm <= 7) {
    // Latent portion (0-3 = 0%-30%)
    stops.push(`${PHASE_CONFIG.LATENT.color} 0%`);
    stops.push(`${PHASE_CONFIG.LATENT.color} 30%`);
    // Active portion (3-7 = 30%-pct%)
    stops.push(`${PHASE_CONFIG.ACTIVE.color} 30%`);
    stops.push(`${PHASE_CONFIG.ACTIVE.color} ${pct}%`);
  } else {
    // Latent (0-30%)
    stops.push(`${PHASE_CONFIG.LATENT.color} 0%`);
    stops.push(`${PHASE_CONFIG.LATENT.color} 30%`);
    // Active (30-70%)
    stops.push(`${PHASE_CONFIG.ACTIVE.color} 30%`);
    stops.push(`${PHASE_CONFIG.ACTIVE.color} 70%`);
    // Transition (70-pct%)
    stops.push(`${PHASE_CONFIG.TRANSITION.color} 70%`);
    stops.push(`${PHASE_CONFIG.TRANSITION.color} ${pct}%`);
  }

  // Transparent for remaining track
  stops.push(`transparent ${pct}%`);
  stops.push(`transparent 100%`);

  return `linear-gradient(to right, ${stops.join(', ')})`;
}

function formatTimeSinceAdmit(admitDate: string): string {
  const now = new Date();
  const admit = new Date(admitDate);
  const diffMs = now.getTime() - admit.getTime();

  if (diffMs < 0) return '-';

  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours} ชม. ${minutes} นาที` : `${hours} ชม.`;
  }
  return `${minutes} นาที`;
}

/**
 * Calculate dilation rate in cm/hour between the earliest and latest entries.
 * Returns null if fewer than 2 entries or if time difference is zero.
 */
function calcDilationRate(entries: PartogramEntry[]): number | null {
  if (entries.length < 2) return null;

  const sorted = [...entries].sort(
    (a, b) => new Date(a.measuredAt).getTime() - new Date(b.measuredAt).getTime()
  );

  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  const timeDiffHours =
    (new Date(last.measuredAt).getTime() - new Date(first.measuredAt).getTime()) / (1000 * 60 * 60);

  if (timeDiffHours <= 0) return null;

  const dilationDiff = last.dilationCm - first.dilationCm;
  return dilationDiff / timeDiffHours;
}

function getLatestEntry(entries: PartogramEntry[]): PartogramEntry {
  return [...entries].sort(
    (a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
  )[0];
}

function getLatestContraction(contractions: ContractionEntry[]): ContractionEntry | null {
  if (contractions.length === 0) return null;
  return [...contractions].sort(
    (a, b) => new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime()
  )[0];
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DilationProgressBar({ dilationCm }: { dilationCm: number }) {
  const phase = getPhase(dilationCm);
  const config = PHASE_CONFIG[phase];
  const ticks = Array.from({ length: 11 }, (_, i) => i);

  return (
    <div>
      {/* Current dilation number + phase label */}
      <div className="flex items-end justify-between mb-2">
        <div className="flex items-baseline gap-2">
          <span
            className="font-mono text-3xl font-bold"
            style={{ color: config.color }}
          >
            {dilationCm}
          </span>
          <span className="text-sm text-slate-500">ซม.</span>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: `${config.color}18`,
            color: config.color,
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: '100%',
              background: buildBarGradient(dilationCm),
            }}
          />
        </div>

        {/* Tick marks */}
        <div className="flex justify-between mt-1">
          {ticks.map((t) => (
            <div key={t} className="flex flex-col items-center" style={{ width: '1px' }}>
              <div className="w-px h-1.5 bg-slate-300" />
              <span className="text-xs font-mono text-slate-400 mt-0.5">{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCell({
  label,
  value,
  unit,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`font-mono text-sm font-semibold ${valueColor ?? 'text-slate-800'}`}>
        {value}
      </div>
      {unit && <div className="text-xs text-slate-400 mt-0.5">{unit}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LaborProgressCard({
  admitDate,
  partogramEntries,
  contractions,
}: LaborProgressCardProps) {
  const hasEntries = partogramEntries !== null && partogramEntries.length > 0;

  const latest = useMemo(
    () => (hasEntries ? getLatestEntry(partogramEntries!) : null),
    [hasEntries, partogramEntries]
  );

  const dilationRate = useMemo(
    () => (hasEntries ? calcDilationRate(partogramEntries!) : null),
    [hasEntries, partogramEntries]
  );

  const latestContraction = useMemo(
    () => getLatestContraction(contractions),
    [contractions]
  );

  const timeSinceAdmit = useMemo(
    () => formatTimeSinceAdmit(admitDate),
    [admitDate]
  );

  // Determine dilation rate color
  const rateColor = useMemo(() => {
    if (dilationRate === null) return 'text-slate-800';
    const currentPhase = latest ? getPhase(latest.dilationCm) : 'LATENT';
    // In active phase (>=4 cm), rate >= 1 cm/hr is good, < 1 is slow
    if (currentPhase !== 'LATENT') {
      return dilationRate >= 1 ? 'text-emerald-600' : 'text-amber-600';
    }
    return 'text-slate-800';
  }, [dilationRate, latest]);

  // Alert indicators
  const exceedsAlertLine = latest !== null && latest.alertLineCm !== null && latest.dilationCm > latest.alertLineCm;
  const exceedsActionLine = latest !== null && latest.actionLineCm !== null && latest.dilationCm > latest.actionLineCm;

  return (
    <div
      className="rounded-sm border"
      style={{ borderColor: 'var(--rule-strong)' }}
    >
      {/* Card header — match the other card headers on this page */}
      <div
        className="flex items-center gap-2 border-b px-3 py-2"
        style={{
          borderColor: 'var(--rule-strong)',
          background: 'linear-gradient(135deg, var(--accent-navy-soft) 0%, white 60%)',
        }}
      >
        <Activity className="h-4 w-4" style={{ color: 'var(--accent-navy)' }} />
        <h3 className="font-mono text-[12px] font-bold uppercase tracking-[0.12em] text-[var(--ink-navy)]">
          ความคืบหน้าการคลอด
        </h3>
      </div>

      <div className="p-3">
      {/* Empty state */}
      {!hasEntries && (
        <div
          className="flex h-28 items-center justify-center border border-dashed font-mono text-[12px]"
          style={{
            borderColor: 'var(--rule-strong)',
            color: 'var(--ink-navy-muted)',
            background: 'color-mix(in srgb, #6b7693 3%, white)',
          }}
        >
          ยังไม่มีข้อมูลการขยายปากมดลูก
        </div>
      )}

      {/* Section 1: Cervix dilation progress bar */}
      {hasEntries && latest && (
        <>
          <DilationProgressBar dilationCm={latest.dilationCm} />

          {/* Section 2: Key labor metrics */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <MetricCell
              label="เวลาตั้งแต่เข้ารับ"
              value={timeSinceAdmit}
            />
            <MetricCell
              label="อัตราการขยาย"
              value={dilationRate !== null ? `${dilationRate.toFixed(1)}` : '-'}
              unit={dilationRate !== null ? 'ซม./ชม.' : undefined}
              valueColor={rateColor}
            />
            <MetricCell
              label="ความรุนแรง UC"
              value={
                latestContraction
                  ? (INTENSITY_LABELS[latestContraction.intensity] ?? '-')
                  : '-'
              }
              valueColor={
                latestContraction
                  ? (INTENSITY_STYLES[latestContraction.intensity]
                      ? undefined
                      : 'text-slate-800')
                  : 'text-slate-400'
              }
            />
          </div>

          {/* Section 3: Alert indicators */}
          {(exceedsActionLine || exceedsAlertLine) && (
            <div className="mt-4 space-y-2">
              {exceedsActionLine && (
                <div className="flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <span className="shrink-0">{'🔴'}</span>
                  <span>เกินเส้นปฏิบัติ — ควรพิจารณาดำเนินการ</span>
                </div>
              )}
              {exceedsAlertLine && !exceedsActionLine && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                  <span className="shrink-0">{'⚠'}</span>
                  <span>เกินเส้นเตือน — พิจารณาเฝ้าระวังใกล้ชิด</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}
