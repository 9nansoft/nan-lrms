// CurrentVitalsPanel — latest vital signs with status badges and mini
// sparklines. Severity tints come from STATUS_TONE (token classes) so
// abnormal vitals jump off the page; the sparkline draws a normal-band overlay
// so a drifting trend is visible at a glance. Empty tiles are dashed and muted,
// so the absence of data is itself a visual signal. Thresholds are unchanged.
'use client';

import { COLOR } from '@/config/design-tokens';
import { HeartPulse, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn, formatRelativeTime } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VitalRecord {
  measuredAt: string;
  maternalHr: number | null;
  fetalHr: string | null;
  sbp: number | null;
  dbp: number | null;
  pphAmountMl: number | null;
}

export interface CurrentVitalsPanelProps {
  vitals: VitalRecord[];
}

type VitalStatus = 'normal' | 'warning' | 'critical';

interface VitalThreshold {
  normalMin: number;
  normalMax: number;
  warningMin: number;
  warningMax: number;
}

const THRESHOLDS: Record<string, VitalThreshold> = {
  maternalHr: { normalMin: 60, normalMax: 100, warningMin: 50, warningMax: 120 },
  fetalHr:    { normalMin: 110, normalMax: 160, warningMin: 100, warningMax: 180 },
  sbp:        { normalMin: 90, normalMax: 140, warningMin: 80, warningMax: 160 },
  dbp:        { normalMin: 60, normalMax: 90, warningMin: 50, warningMax: 100 },
  pph:        { normalMin: 0, normalMax: 500, warningMin: 0, warningMax: 1000 },
};

function evaluateStatus(value: number, threshold: VitalThreshold): VitalStatus {
  if (value >= threshold.normalMin && value <= threshold.normalMax) return 'normal';
  if (value >= threshold.warningMin && value <= threshold.warningMax) return 'warning';
  return 'critical';
}

/** For BP we take the worst status of SBP and DBP. */
function evaluateBpStatus(sbp: number, dbp: number): VitalStatus {
  const sbpStatus = evaluateStatus(sbp, THRESHOLDS.sbp);
  const dbpStatus = evaluateStatus(dbp, THRESHOLDS.dbp);
  const priority: VitalStatus[] = ['critical', 'warning', 'normal'];
  for (const p of priority) {
    if (sbpStatus === p || dbpStatus === p) return p;
  }
  return 'normal';
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------

const STATUS_META: Record<VitalStatus, { tone: StatusTone; stroke: string; label: string; icon: typeof CheckCircle2 }> = {
  normal: { tone: 'ok', stroke: COLOR.riskLow, label: 'ปกติ', icon: CheckCircle2 },
  warning: { tone: 'warn', stroke: COLOR.riskMedium, label: 'เฝ้าระวัง', icon: AlertTriangle },
  critical: { tone: 'danger', stroke: COLOR.riskHigh, label: 'ผิดปกติ', icon: AlertTriangle },
};

// ---------------------------------------------------------------------------
// Mini sparkline (with normal-band shading)
// ---------------------------------------------------------------------------

function MiniSparkline({
  values,
  color,
  normalMin,
  normalMax,
}: {
  values: number[];
  color: string;
  normalMin?: number;
  normalMax?: number;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 28;
  const padding = 3;

  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  // Extend Y range to include the normal band so the band is always visible
  // even when the patient's readings are far outside of it.
  const yMin = normalMin != null ? Math.min(dataMin, normalMin) - 2 : dataMin;
  const yMax = normalMax != null ? Math.max(dataMax, normalMax) + 2 : dataMax;
  const range = yMax - yMin || 1;

  const toY = (v: number) => height - padding - ((v - yMin) / range) * (height - padding * 2);

  const points = values.map((v, i) => {
    const x = padding + (i / (values.length - 1)) * (width - padding * 2);
    return `${x},${toY(v)}`;
  });
  const d = points.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(' ');

  // Last-point highlight — larger dot if last value is abnormal.
  const last = values[values.length - 1];
  const lastX = padding + (width - padding * 2);
  const lastY = toY(last);
  const lastAbnormal =
    (normalMin != null && last < normalMin) || (normalMax != null && last > normalMax);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Normal-band shading */}
      {normalMin != null && normalMax != null && (
        <rect
          x={0}
          y={toY(normalMax)}
          width={width}
          height={toY(normalMin) - toY(normalMax)}
          fill={COLOR.riskLow}
          fillOpacity={0.14}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={lastAbnormal ? 2.75 : 1.75}
        fill={color}
        stroke={COLOR.surfaceCard}
        strokeWidth={lastAbnormal ? 1 : 0.5}
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Single vital item
// ---------------------------------------------------------------------------

interface VitalItemProps {
  label: string;
  displayValue: string;
  unit: string;
  status: VitalStatus;
  normalRangeText: string;
  sparklineValues: number[];
  lastMeasuredAt: string | null;
  normalMin?: number;
  normalMax?: number;
}

function VitalItem({
  label,
  displayValue,
  unit,
  status,
  normalRangeText,
  sparklineValues,
  lastMeasuredAt,
  normalMin,
  normalMax,
}: VitalItemProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const t = STATUS_TONE[meta.tone];

  return (
    <div
      data-vital-tile
      className={cn('relative flex flex-col gap-1 rounded-xl border border-border border-l-4 px-3 py-2', t.accent, t.tint)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-label text-ink">{label}</div>
        <div
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold',
            status === 'critical' ? 'bg-danger text-white' : cn('bg-surface-card', t.text),
          )}
        >
          <Icon aria-hidden="true" className="h-3 w-3" />
          {meta.label}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn('text-kpi-sm tabular-nums', t.text)}>{displayValue}</span>
        <span className="text-caption text-ink-muted">{unit}</span>
        <div className="ml-auto">
          <MiniSparkline
            values={sparklineValues}
            color={meta.stroke}
            normalMin={normalMin}
            normalMax={normalMax}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-caption text-ink-muted">
        <span>{normalRangeText}</span>
        <span>{lastMeasuredAt ? formatRelativeTime(lastMeasuredAt) : '—'}</span>
      </div>
    </div>
  );
}

function VitalItemEmpty({ label, unit }: { label: string; unit: string }) {
  return (
    <div
      data-vital-tile
      className="flex flex-col gap-1 rounded-xl border border-dashed border-border bg-surface-muted px-3 py-2"
    >
      <div className="text-label text-ink-muted">{label}</div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-kpi-sm text-ink-muted">—</span>
        <span className="text-caption text-ink-muted">{unit}</span>
      </div>
      <div className="text-caption text-ink-muted">ไม่มีข้อมูล</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Data extraction helpers
// ---------------------------------------------------------------------------

function extractHistory(
  vitals: VitalRecord[],
  extractor: (v: VitalRecord) => number | null,
  count: number = 10,
): number[] {
  const result: number[] = [];
  for (const v of vitals) {
    const val = extractor(v);
    if (val !== null && val !== undefined) {
      result.push(val);
    }
  }
  return result.slice(-count);
}

function findLatest(
  vitals: VitalRecord[],
  extractor: (v: VitalRecord) => number | string | null,
): VitalRecord | null {
  for (let i = vitals.length - 1; i >= 0; i--) {
    const val = extractor(vitals[i]);
    if (val !== null && val !== undefined) return vitals[i];
  }
  return null;
}

function parseFetalHr(raw: string | null): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CurrentVitalsPanel({ vitals }: CurrentVitalsPanelProps) {
  // -- Maternal HR --------------------------------------------------------
  const latestMhr = findLatest(vitals, (v) => v.maternalHr);
  const mhrValue = latestMhr?.maternalHr ?? null;
  const mhrHistory = extractHistory(vitals, (v) => v.maternalHr);

  // -- Fetal HR -----------------------------------------------------------
  const latestFhr = findLatest(vitals, (v) => v.fetalHr);
  const fhrValue = latestFhr ? parseFetalHr(latestFhr.fetalHr) : null;
  const fhrHistory = extractHistory(vitals, (v) => parseFetalHr(v.fetalHr));

  // -- Blood Pressure -----------------------------------------------------
  const latestBp = findLatest(vitals, (v) => (v.sbp !== null && v.dbp !== null ? v.sbp : null));
  const sbpValue = latestBp?.sbp ?? null;
  const dbpValue = latestBp?.dbp ?? null;
  const sbpHistory = extractHistory(vitals, (v) => v.sbp);

  // -- PPH ----------------------------------------------------------------
  const latestPph = findLatest(vitals, (v) => v.pphAmountMl);
  const pphValue = latestPph?.pphAmountMl ?? null;
  const pphHistory = extractHistory(vitals, (v) => v.pphAmountMl);

  // How many tiles are abnormal — used to decorate the header.
  const criticalCount = [
    mhrValue != null && evaluateStatus(mhrValue, THRESHOLDS.maternalHr) === 'critical',
    fhrValue != null && evaluateStatus(fhrValue, THRESHOLDS.fetalHr) === 'critical',
    sbpValue != null && dbpValue != null && evaluateBpStatus(sbpValue, dbpValue) === 'critical',
    pphValue != null && evaluateStatus(pphValue, THRESHOLDS.pph) === 'critical',
  ].filter(Boolean).length;

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <HeartPulse aria-hidden="true" className="h-4 w-4 text-danger" />
        <h3 className="text-body-lg text-ink">สัญญาณชีพปัจจุบัน</h3>
        {criticalCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-danger px-2 py-0.5 text-caption font-semibold text-white">
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            ผิดปกติ {criticalCount} รายการ
          </span>
        )}
      </div>

      <div className="@container">
        <div className="grid grid-cols-1 gap-2 @min-[520px]:grid-cols-2">
        {/* Maternal HR */}
        {mhrValue !== null ? (
          <VitalItem
            label="ชีพจรมารดา"
            displayValue={String(mhrValue)}
            unit="bpm"
            status={evaluateStatus(mhrValue, THRESHOLDS.maternalHr)}
            normalRangeText="ปกติ: 60-100 bpm"
            sparklineValues={mhrHistory}
            lastMeasuredAt={latestMhr?.measuredAt ?? null}
            normalMin={THRESHOLDS.maternalHr.normalMin}
            normalMax={THRESHOLDS.maternalHr.normalMax}
          />
        ) : (
          <VitalItemEmpty label="ชีพจรมารดา" unit="bpm" />
        )}

        {/* Fetal HR */}
        {fhrValue !== null ? (
          <VitalItem
            label="ชีพจรทารก"
            displayValue={String(fhrValue)}
            unit="bpm"
            status={evaluateStatus(fhrValue, THRESHOLDS.fetalHr)}
            normalRangeText="ปกติ: 110-160 bpm"
            sparklineValues={fhrHistory}
            lastMeasuredAt={latestFhr?.measuredAt ?? null}
            normalMin={THRESHOLDS.fetalHr.normalMin}
            normalMax={THRESHOLDS.fetalHr.normalMax}
          />
        ) : (
          <VitalItemEmpty label="ชีพจรทารก" unit="bpm" />
        )}

        {/* Blood Pressure */}
        {sbpValue !== null && dbpValue !== null ? (
          <VitalItem
            label="ความดันโลหิต"
            displayValue={`${sbpValue}/${dbpValue}`}
            unit="mmHg"
            status={evaluateBpStatus(sbpValue, dbpValue)}
            normalRangeText="ปกติ: 90-140/60-90 mmHg"
            sparklineValues={sbpHistory}
            lastMeasuredAt={latestBp?.measuredAt ?? null}
            normalMin={THRESHOLDS.sbp.normalMin}
            normalMax={THRESHOLDS.sbp.normalMax}
          />
        ) : (
          <VitalItemEmpty label="ความดันโลหิต" unit="mmHg" />
        )}

        {/* PPH */}
        {pphValue !== null ? (
          <VitalItem
            label="เลือดออกหลังคลอด"
            displayValue={String(pphValue)}
            unit="ml"
            status={evaluateStatus(pphValue, THRESHOLDS.pph)}
            normalRangeText="ปกติ: < 500 ml"
            sparklineValues={pphHistory}
            lastMeasuredAt={latestPph?.measuredAt ?? null}
            normalMin={0}
            normalMax={THRESHOLDS.pph.normalMax}
          />
        ) : (
          <VitalItemEmpty label="เลือดออกหลังคลอด" unit="ml" />
        )}
        </div>
      </div>
    </div>
  );
}
