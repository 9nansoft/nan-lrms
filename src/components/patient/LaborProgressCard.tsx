// LaborProgressCard — visual summary of labor progress with cervix dilation and phases
'use client';

import { COLOR, withAlpha } from '@/config/design-tokens';
import { LABOUR_PHASE_LABEL_TH } from '@/config/obstetric-display';
import { useMemo } from 'react';
import { Activity, AlertTriangle } from 'lucide-react';

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
  LATENT: { label: LABOUR_PHASE_LABEL_TH.latent, color: COLOR.inkSubtle },
  ACTIVE: { label: LABOUR_PHASE_LABEL_TH.active, color: COLOR.brand },
  TRANSITION: { label: LABOUR_PHASE_LABEL_TH.transition, color: COLOR.riskMedium },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

const INTENSITY_LABELS: Record<string, string> = {
  MILD: 'เบา',
  MODERATE: 'ปานกลาง',
  STRONG: 'รุนแรง',
};

const INTENSITY_STYLES: Record<string, string> = {
  MILD: 'bg-surface-muted text-ink-muted',
  MODERATE: 'bg-warn-tint text-warn-text',
  STRONG: 'bg-danger-tint text-danger-text',
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
            className="text-kpi-sm font-bold"
            style={{ color: config.color }}
          >
            {dilationCm}
          </span>
          <span className="text-body text-ink-muted">ซม.</span>
        </div>
        <span
          className="text-caption font-medium px-2 py-0.5 rounded-full"
          style={{
            backgroundColor: withAlpha(config.color, 0.1),
            color: config.color,
          }}
        >
          {config.label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative">
        <div className="h-3 rounded-full bg-surface-muted overflow-hidden">
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
              <div className="w-px h-1.5 bg-border" />
              <span className="text-caption text-ink-muted mt-0.5">{t}</span>
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
    <div className="bg-surface-muted rounded-xl p-3 text-center">
      <div className="text-caption text-ink-muted mb-1">{label}</div>
      <div className={`text-body font-semibold ${valueColor ?? 'text-ink'}`}>
        {value}
      </div>
      {unit && <div className="text-caption text-ink-muted mt-0.5">{unit}</div>}
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
    if (dilationRate === null) return 'text-ink';
    const currentPhase = latest ? getPhase(latest.dilationCm) : 'LATENT';
    // In active phase (>=4 cm), rate >= 1 cm/hr is good, < 1 is slow
    if (currentPhase !== 'LATENT') {
      return dilationRate >= 1 ? 'text-ok-text' : 'text-warn-text';
    }
    return 'text-ink';
  }, [dilationRate, latest]);

  // Alert indicators
  const exceedsAlertLine = latest !== null && latest.alertLineCm !== null && latest.dilationCm > latest.alertLineCm;
  const exceedsActionLine = latest !== null && latest.actionLineCm !== null && latest.dilationCm > latest.actionLineCm;

  return (
    <div className="rounded-2xl border border-border bg-surface-card">
      {/* Card header — match the other card headers on this page */}
      <div className="flex items-center gap-2 border-b border-border bg-brand-soft/40 px-3 py-2">
        <Activity aria-hidden="true" className="h-4 w-4 text-brand" />
        <h3 className="text-body-lg text-ink">ความคืบหน้าการคลอด</h3>
      </div>

      <div className="p-3">
      {/* Empty state */}
      {!hasEntries && (
        <div className="flex h-28 items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted text-body text-ink-muted">
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
                      : 'text-ink')
                  : 'text-ink-muted'
              }
            />
          </div>

          {/* Section 3: Alert indicators */}
          {(exceedsActionLine || exceedsAlertLine) && (
            <div className="mt-4 space-y-2">
              {exceedsActionLine && (
                <div className="flex items-start gap-2 rounded-xl bg-danger-tint border border-danger/40 px-3 py-2 text-body text-danger-text">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>เกินเส้นปฏิบัติ — ควรพิจารณาดำเนินการ</span>
                </div>
              )}
              {exceedsAlertLine && !exceedsActionLine && (
                <div className="flex items-start gap-2 rounded-xl bg-warn-tint border border-warn/40 px-3 py-2 text-body text-warn-text">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
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
