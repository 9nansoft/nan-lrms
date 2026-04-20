// VitalSignChart — SVG port of HOSxPIPDPulseTempChartEntryFrameUnit.
// Main panel merges Temperature and Pulse onto a single chart with dual
// Y axes (Pulse 40–160 bpm on the left, Temperature 35–41 °C on the right),
// a red 37 °C reference line, and a day-grouped X-axis header (Date / Days
// after Admission / Days after Operation / 4-hour time slots). Matches the
// HOSxP paper form nurses print. Extra stacked panels for Respiration and
// Blood Pressure follow below.
'use client';

import type { NurseNoteRow } from '@/types/maternity-ward';

interface VitalSignChartProps {
  observations: NurseNoteRow[];
  /** Optional admit date (ISO/YYYY-MM-DD). Used to compute "Days after
   *  Admission" row in the header. Falls back to the earliest observation. */
  admitDate?: string | null;
  /** Optional operation start datetime. Used to compute "Days after
   *  Operation" row in the header. */
  operationStartDate?: string | null;
}

// ─── Page layout ──────────────────────────────────────────────────────────

const P = {
  W: 1280,
  H: 820,
  MARGIN: 10,
  LEFT_W: 72,
  RIGHT_W: 36,
  HEADER_H: 32,
  HEADER_ROWS: { DATE: 22, ADMIT: 18, OP: 18, TIME: 18 },
  PANEL: { TEMP_PULSE: 360, RR: 120, BP: 160 },
  SLOT_HOURS: 4,                 // 4-hour ticks per day (Delphi uses 2/6/10/14/18/22)
  DAYS: 7,                       // default visible days when no data
  FOOTER_H: 24,
};

const C = {
  BG: '#FFFFFF',
  LINE_MAJOR: '#3A5A9E',         // bold blue day separators
  LINE_MINOR: '#C7D5EE',         // pale-blue 4-hour gridlines
  HEADER_BG: '#F0F4FB',
  LABEL: '#283044',
  LABEL_FAINT: '#6B7280',
  TEMP: '#1E40AF',
  TEMP_REF_37: '#D93434',
  PULSE: '#B01F1F',
  RR: '#0F6E6E',
  BP_SYS: '#B02020',
  BP_DIA: '#D88080',
  BP_CONNECT: '#C25757',
  NORMAL_BAND_TEMP: '#E5F2FF',
  ABN: '#E84444',
};

// Temperature / Pulse shared axis config (mirrors Delphi).
const TEMP_AXIS = { min: 35, max: 41 };          // °C right axis
const PULSE_AXIS = { min: 40, max: 160 };        // bpm left axis
const RR_AXIS = { min: 10, max: 40 };
const BP_AXIS = { min: 40, max: 200 };

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseTs(v: NurseNoteRow): number | null {
  const d = v.note_date ?? null;
  const t = v.note_time ?? null;
  let raw: string | null = null;
  if (d && t) raw = `${d}T${t.length === 5 ? `${t}:00` : t}`;
  else if (d) raw = d;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

// Drop time-of-day; return the day's 00:00 in local time.
function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Compute the domain: 7 days starting from the earliest observation's date
// (or today if there are no observations). Each day spans 24 h, split into
// 4-hour slots (6 per day).
interface DayDomain {
  startMs: number;
  endMs: number;
  dayCount: number;
}
function computeDomain(obs: NurseNoteRow[], admitDate?: string | null): DayDomain {
  const ts = obs.map(parseTs).filter((v): v is number => v !== null);
  let startMs: number;
  if (admitDate) {
    const p = Date.parse(admitDate);
    startMs = Number.isFinite(p) ? startOfDayMs(p) : startOfDayMs(Date.now());
  } else if (ts.length > 0) {
    startMs = startOfDayMs(Math.min(...ts));
  } else {
    startMs = startOfDayMs(Date.now());
  }
  let dayCount = P.DAYS;
  if (ts.length > 0) {
    const maxMs = Math.max(...ts);
    const spanDays = Math.ceil((startOfDayMs(maxMs) - startMs) / 86_400_000) + 1;
    dayCount = Math.max(P.DAYS, spanDays);
  }
  return { startMs, endMs: startMs + dayCount * 86_400_000, dayCount };
}

function xToPx(ts: number, dom: DayDomain, left: number, right: number): number {
  if (dom.endMs === dom.startMs) return (left + right) / 2;
  const clamped = Math.max(dom.startMs, Math.min(dom.endMs, ts));
  return left + ((clamped - dom.startMs) / (dom.endMs - dom.startMs)) * (right - left);
}

function yTransform(v: number, yMin: number, yMax: number, top: number, bottom: number): number {
  const c = Math.max(yMin, Math.min(yMax, v));
  return bottom - ((c - yMin) / (yMax - yMin)) * (bottom - top);
}

// Format date using Thai Buddhist year (e.g. "14 เม.ย. 69") to match HOSxP.
const THAI_MONTHS_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
function formatDateTh(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${THAI_MONTHS_ABBR[d.getMonth()]} ${String(d.getFullYear() + 543).slice(-2)}`;
}

function daysBetween(dayMs: number, refDate: string | null | undefined): number | null {
  if (!refDate) return null;
  const ref = Date.parse(refDate);
  if (!Number.isFinite(ref)) return null;
  return Math.floor((dayMs - startOfDayMs(ref)) / 86_400_000);
}

// ─── Day-grouped header ───────────────────────────────────────────────────

interface DayHeaderProps {
  x: number;
  y: number;
  left: number;         // chart-area left edge (after left label column)
  right: number;        // chart-area right edge
  dom: DayDomain;
  admitDate?: string | null;
  operationStartDate?: string | null;
}

function DayHeader({ x, y, left, right, dom, admitDate, operationStartDate }: DayHeaderProps) {
  const ROW = P.HEADER_ROWS;
  const totalH = ROW.DATE + ROW.ADMIT + ROW.OP + ROW.TIME;
  const dayW = (right - left) / dom.dayCount;

  const dateRow = y;
  const admitRow = dateRow + ROW.DATE;
  const opRow = admitRow + ROW.ADMIT;
  const timeRow = opRow + ROW.OP;

  const days: React.ReactElement[] = [];
  for (let i = 0; i < dom.dayCount; i++) {
    const cellX = left + i * dayW;
    const dayMs = dom.startMs + i * 86_400_000;
    const admitDay = daysBetween(dayMs, admitDate);
    const opDay = daysBetween(dayMs, operationStartDate);
    days.push(
      <g key={`day-${i}`}>
        {/* Date cell */}
        <rect x={cellX} y={dateRow} width={dayW} height={ROW.DATE} fill="none" stroke={C.LINE_MAJOR} />
        <text x={cellX + dayW / 2} y={dateRow + ROW.DATE / 2 + 4} fontSize={11} fontWeight={700} fill={C.LABEL} textAnchor="middle">
          {formatDateTh(dayMs)}
        </text>
        {/* Days after admission */}
        <rect x={cellX} y={admitRow} width={dayW} height={ROW.ADMIT} fill="none" stroke={C.LINE_MAJOR} />
        <text x={cellX + dayW / 2} y={admitRow + ROW.ADMIT / 2 + 4} fontSize={10} fill={C.LABEL} textAnchor="middle">
          {admitDay !== null && admitDay >= 0 ? String(admitDay) : ''}
        </text>
        {/* Days after operation */}
        <rect x={cellX} y={opRow} width={dayW} height={ROW.OP} fill="none" stroke={C.LINE_MAJOR} />
        <text x={cellX + dayW / 2} y={opRow + ROW.OP / 2 + 4} fontSize={10} fill={C.LABEL} textAnchor="middle">
          {opDay !== null && opDay >= 0 ? String(opDay) : ''}
        </text>
        {/* 4-hour time slots */}
        {(() => {
          const slots = [2, 6, 10, 14, 18, 22];
          const slotW = dayW / slots.length;
          return slots.map((hr, j) => {
            const sx = cellX + j * slotW;
            return (
              <g key={`slot-${i}-${j}`}>
                <rect x={sx} y={timeRow} width={slotW} height={ROW.TIME} fill="none" stroke={C.LINE_MINOR} />
                <text x={sx + slotW / 2} y={timeRow + ROW.TIME / 2 + 4} fontSize={9} fill={C.LABEL_FAINT} textAnchor="middle">
                  {hr}
                </text>
              </g>
            );
          });
        })()}
      </g>,
    );
  }

  return (
    <g data-testid="vs-day-header">
      {/* Label column — matches the body's left axis width */}
      <rect x={x} y={y} width={left - x} height={totalH} fill={C.HEADER_BG} stroke={C.LINE_MAJOR} />
      <text x={x + 6} y={dateRow + ROW.DATE / 2 + 4} fontSize={10} fontWeight={700} fill={C.LABEL}>Date</text>
      <text x={x + 6} y={admitRow + ROW.ADMIT / 2 + 4} fontSize={9} fill={C.LABEL}>Admit day</text>
      <text x={x + 6} y={opRow + ROW.OP / 2 + 4} fontSize={9} fill={C.LABEL}>Op day</text>
      <text x={x + 6} y={timeRow + ROW.TIME / 2 + 4} fontSize={9} fontWeight={700} fill={C.LABEL}>Time</text>
      {days}
    </g>
  );
}

// ─── Combined Temp + Pulse panel (dual Y axis) ────────────────────────────

interface ComboPanelProps {
  x: number; y: number; w: number; h: number;
  obs: NurseNoteRow[]; dom: DayDomain;
}
function TempPulsePanel({ x, y, w, h, obs, dom }: ComboPanelProps) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w - P.RIGHT_W;
  const chartTop = y + 4;
  const chartBottom = y + h - 4;

  // Pulse (left axis, 40–160 bpm, ticks every 10)
  const pulseTicks: React.ReactElement[] = [];
  for (let v = PULSE_AXIS.min; v <= PULSE_AXIS.max; v += 10) {
    const py = yTransform(v, PULSE_AXIS.min, PULSE_AXIS.max, chartTop, chartBottom);
    pulseTicks.push(
      <line key={`pL${v}`} x1={chartLeft} y1={py} x2={chartRight} y2={py} stroke={C.LINE_MINOR} strokeWidth={0.5} />,
    );
    pulseTicks.push(
      <text key={`pLt${v}`} x={chartLeft - 6} y={py + 4} fontSize={10} fill={C.PULSE} textAnchor="end">{v}</text>,
    );
  }

  // Temperature (right axis, 35–41 °C, ticks every 1)
  const tempTicks: React.ReactElement[] = [];
  for (let v = TEMP_AXIS.min; v <= TEMP_AXIS.max; v++) {
    const py = yTransform(v, TEMP_AXIS.min, TEMP_AXIS.max, chartTop, chartBottom);
    tempTicks.push(
      <text key={`tR${v}`} x={chartRight + 6} y={py + 4} fontSize={10} fill={C.TEMP} textAnchor="start">{v}</text>,
    );
  }

  // Day separators (major) + 4-hour gridlines (minor) — HOSxP look.
  const vlines: React.ReactElement[] = [];
  const dayW = (chartRight - chartLeft) / dom.dayCount;
  for (let i = 0; i <= dom.dayCount; i++) {
    const vx = chartLeft + i * dayW;
    vlines.push(
      <line key={`vM${i}`} x1={vx} y1={chartTop} x2={vx} y2={chartBottom} stroke={C.LINE_MAJOR} strokeWidth={1} />,
    );
    if (i < dom.dayCount) {
      for (let j = 1; j < 6; j++) {
        const sx = vx + (j * dayW) / 6;
        vlines.push(
          <line key={`vm${i}-${j}`} x1={sx} y1={chartTop} x2={sx} y2={chartBottom} stroke={C.LINE_MINOR} strokeWidth={0.5} />,
        );
      }
    }
  }

  // 37 °C reference line.
  const y37 = yTransform(37, TEMP_AXIS.min, TEMP_AXIS.max, chartTop, chartBottom);

  // Sorted observation points.
  type Pt = { id: string; ts: number; px: number; py: number; value: number };
  function collect(
    extract: (o: NurseNoteRow) => number | null | undefined,
    yMin: number,
    yMax: number,
  ): Pt[] {
    const pts: Pt[] = [];
    for (const o of obs) {
      const ts = parseTs(o);
      const v = extract(o);
      if (ts === null || v === null || v === undefined || !Number.isFinite(v as number)) continue;
      const px = xToPx(ts, dom, chartLeft, chartRight);
      if (px < chartLeft || px > chartRight) continue;
      pts.push({
        id: String(o.nurse_note_id ?? ts),
        ts,
        px,
        py: yTransform(v as number, yMin, yMax, chartTop, chartBottom),
        value: v as number,
      });
    }
    return pts.sort((a, b) => a.ts - b.ts);
  }

  const tempPts = collect((o) => o.temperature, TEMP_AXIS.min, TEMP_AXIS.max);
  const pulsePts = collect((o) => o.pulse, PULSE_AXIS.min, PULSE_AXIS.max);

  return (
    <g data-testid="vs-panel-temp-pulse">
      {/* Left label column with "Indicate Pulse in Red" note, matching HOSxP */}
      <rect x={x} y={y} width={P.LEFT_W} height={h} fill={C.HEADER_BG} stroke={C.LINE_MAJOR} />
      <g transform={`translate(${x + 20}, ${y + h / 2}) rotate(-90)`}>
        <text fontSize={11} fontWeight={700} fill={C.PULSE} textAnchor="middle">Indicate Pulse in Red</text>
      </g>
      {/* Chart body */}
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} stroke={C.LINE_MAJOR} />
      {vlines}
      {pulseTicks}
      {tempTicks}
      {/* Right axis spine */}
      <line x1={chartRight} y1={chartTop} x2={chartRight} y2={chartBottom} stroke={C.LINE_MAJOR} />
      {/* 37 °C reference line (red) */}
      <line data-testid="vs-temp-ref-37" x1={chartLeft} y1={y37} x2={chartRight} y2={y37} stroke={C.TEMP_REF_37} strokeWidth={1.5} />
      {/* Pulse polyline + dots */}
      {pulsePts.slice(1).map((p, i) => (
        <line key={`pl${p.id}`} x1={pulsePts[i].px} y1={pulsePts[i].py} x2={p.px} y2={p.py}
              stroke={C.PULSE} strokeWidth={1.5} />
      ))}
      {pulsePts.map((p) => {
        const abn = p.value < 60 || p.value > 100;
        return (
          <circle key={`p-${p.id}`} cx={p.px} cy={p.py} r={4}
                  data-role="vs-point" data-series="pulse"
                  data-abnormal={abn ? 'true' : undefined}
                  fill={abn ? C.ABN : C.PULSE}
                  stroke={abn ? C.ABN : C.PULSE}>
            <title>{`Pulse ${p.value} bpm`}</title>
          </circle>
        );
      })}
      {/* Temperature polyline + dots */}
      {tempPts.slice(1).map((p, i) => (
        <line key={`tl${p.id}`} x1={tempPts[i].px} y1={tempPts[i].py} x2={p.px} y2={p.py}
              stroke={C.TEMP} strokeWidth={1.5} />
      ))}
      {tempPts.map((p) => {
        const abn = p.value >= 38;
        return (
          <circle key={`t-${p.id}`} cx={p.px} cy={p.py} r={4}
                  data-role="vs-point" data-series="temp"
                  data-abnormal={abn ? 'true' : undefined}
                  fill={abn ? C.ABN : C.TEMP}
                  stroke={abn ? C.ABN : C.TEMP}>
            <title>{`Temp ${p.value} °C`}</title>
          </circle>
        );
      })}
    </g>
  );
}

// ─── Simple stacked strip (RR, BP) ────────────────────────────────────────

interface StripProps {
  x: number; y: number; w: number; h: number;
  title: string;
  subtitle?: string;
  yMin: number; yMax: number; yStep: number;
  color: string;
  obs: NurseNoteRow[]; dom: DayDomain;
  extract: (o: NurseNoteRow) => number | null | undefined;
  abnormal?: (v: number) => boolean;
  testid: string;
}
function Strip({
  x, y, w, h, title, subtitle, yMin, yMax, yStep,
  color, obs, dom, extract, abnormal, testid,
}: StripProps) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w - P.RIGHT_W;
  const chartTop = y + 4;
  const chartBottom = y + h - 4;

  const ticks: React.ReactElement[] = [];
  for (let v = yMin; v <= yMax; v += yStep) {
    const py = yTransform(v, yMin, yMax, chartTop, chartBottom);
    ticks.push(<line key={`g${v}`} x1={chartLeft} y1={py} x2={chartRight} y2={py} stroke={C.LINE_MINOR} strokeWidth={0.5} />);
    ticks.push(<text key={`t${v}`} x={chartLeft - 6} y={py + 4} fontSize={10} fill={C.LABEL_FAINT} textAnchor="end">{v}</text>);
  }

  const dayW = (chartRight - chartLeft) / dom.dayCount;
  const vlines: React.ReactElement[] = [];
  for (let i = 0; i <= dom.dayCount; i++) {
    const vx = chartLeft + i * dayW;
    vlines.push(<line key={`v${i}`} x1={vx} y1={chartTop} x2={vx} y2={chartBottom} stroke={C.LINE_MAJOR} strokeWidth={0.8} />);
  }

  type Pt = { id: string; ts: number; px: number; py: number; value: number };
  const pts: Pt[] = [];
  for (const o of obs) {
    const ts = parseTs(o);
    const v = extract(o);
    if (ts === null || v === null || v === undefined || !Number.isFinite(v as number)) continue;
    const px = xToPx(ts, dom, chartLeft, chartRight);
    if (px < chartLeft || px > chartRight) continue;
    pts.push({
      id: String(o.nurse_note_id ?? ts),
      ts,
      px,
      py: yTransform(v as number, yMin, yMax, chartTop, chartBottom),
      value: v as number,
    });
  }
  pts.sort((a, b) => a.ts - b.ts);

  return (
    <g data-testid={testid}>
      <rect x={x} y={y} width={P.LEFT_W} height={h} fill={C.HEADER_BG} stroke={C.LINE_MAJOR} />
      <text x={x + 10} y={y + 18} fontSize={11} fontWeight={700} fill={C.LABEL}>{title}</text>
      {subtitle && <text x={x + 10} y={y + 32} fontSize={10} fill={C.LABEL_FAINT}>{subtitle}</text>}
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} stroke={C.LINE_MAJOR} />
      {vlines}
      {ticks}
      {pts.slice(1).map((p, i) => (
        <line key={`l${p.id}`} x1={pts[i].px} y1={pts[i].py} x2={p.px} y2={p.py}
              stroke={color} strokeWidth={1.5} />
      ))}
      {pts.map((p) => {
        const abn = abnormal ? abnormal(p.value) : false;
        return (
          <circle key={p.id} cx={p.px} cy={p.py} r={3.5}
                  data-role="vs-point"
                  data-abnormal={abn ? 'true' : undefined}
                  fill={abn ? C.ABN : color}
                  stroke={abn ? C.ABN : color}>
            <title>{String(p.value)}</title>
          </circle>
        );
      })}
    </g>
  );
}

// ─── BP panel with sys/dia arrows + pulse-pressure connector ──────────────

interface BpPanelProps {
  x: number; y: number; w: number; h: number;
  obs: NurseNoteRow[]; dom: DayDomain;
}
function BpPanel({ x, y, w, h, obs, dom }: BpPanelProps) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w - P.RIGHT_W;
  const chartTop = y + 4;
  const chartBottom = y + h - 4;

  const ticks: React.ReactElement[] = [];
  for (let v = BP_AXIS.min; v <= BP_AXIS.max; v += 20) {
    const py = yTransform(v, BP_AXIS.min, BP_AXIS.max, chartTop, chartBottom);
    ticks.push(<line key={`g${v}`} x1={chartLeft} y1={py} x2={chartRight} y2={py} stroke={C.LINE_MINOR} strokeWidth={0.5} />);
    ticks.push(<text key={`t${v}`} x={chartLeft - 6} y={py + 4} fontSize={10} fill={C.LABEL_FAINT} textAnchor="end">{v}</text>);
  }

  const dayW = (chartRight - chartLeft) / dom.dayCount;
  const vlines: React.ReactElement[] = [];
  for (let i = 0; i <= dom.dayCount; i++) {
    const vx = chartLeft + i * dayW;
    vlines.push(<line key={`v${i}`} x1={vx} y1={chartTop} x2={vx} y2={chartBottom} stroke={C.LINE_MAJOR} strokeWidth={0.8} />);
  }

  return (
    <g data-testid="vs-panel-bp">
      <rect x={x} y={y} width={P.LEFT_W} height={h} fill={C.HEADER_BG} stroke={C.LINE_MAJOR} />
      <text x={x + 10} y={y + 18} fontSize={11} fontWeight={700} fill={C.LABEL}>Blood Pressure</text>
      <text x={x + 10} y={y + 32} fontSize={10} fill={C.LABEL_FAINT}>mmHg</text>
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} stroke={C.LINE_MAJOR} />
      {vlines}
      {ticks}
      {obs.map((o) => {
        const ts = parseTs(o);
        const sys = typeof o.bp_systolic === 'number' ? o.bp_systolic : null;
        const dia = typeof o.bp_diastolic === 'number' ? o.bp_diastolic : null;
        if (ts === null || (sys === null && dia === null)) return null;
        const px = xToPx(ts, dom, chartLeft, chartRight);
        if (px < chartLeft || px > chartRight) return null;
        const abn = (sys ?? 0) >= 140 || (dia ?? 0) >= 90;
        const color = abn ? C.ABN : C.BP_CONNECT;
        const pysys = sys !== null ? yTransform(sys, BP_AXIS.min, BP_AXIS.max, chartTop, chartBottom) : chartBottom;
        const pydia = dia !== null ? yTransform(dia, BP_AXIS.min, BP_AXIS.max, chartTop, chartBottom) : chartBottom;
        return (
          <g key={String(o.nurse_note_id ?? ts)}
             data-role="vs-point"
             data-abnormal={abn ? 'true' : undefined}>
            {sys !== null && dia !== null && (
              <line x1={px} y1={pysys} x2={px} y2={pydia} stroke={color} strokeWidth={1.5} />
            )}
            {sys !== null && (
              <>
                <line x1={px} y1={pysys} x2={px - 5} y2={pysys + 7} stroke={C.BP_SYS} strokeWidth={1.5} />
                <line x1={px} y1={pysys} x2={px + 5} y2={pysys + 7} stroke={C.BP_SYS} strokeWidth={1.5} />
              </>
            )}
            {dia !== null && (
              <>
                <line x1={px} y1={pydia} x2={px - 5} y2={pydia - 7} stroke={C.BP_DIA} strokeWidth={1.5} />
                <line x1={px} y1={pydia} x2={px + 5} y2={pydia - 7} stroke={C.BP_DIA} strokeWidth={1.5} />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function VitalSignChart({ observations, admitDate, operationStartDate }: VitalSignChartProps) {
  const dom = computeDomain(observations, admitDate);
  const x = P.MARGIN;
  let cy = P.MARGIN;
  const strips: React.ReactElement[] = [];

  // Title strip — mirrors the HOSxP form header.
  strips.push(
    <g key="title">
      <rect x={x} y={cy} width={P.W - 2 * P.MARGIN} height={P.HEADER_H} fill={C.HEADER_BG} stroke={C.LINE_MAJOR} />
      <text x={x + 12} y={cy + P.HEADER_H / 2 + 5} fontSize={14} fontWeight={800} fill={C.LABEL}>
        VITAL SIGNS CHART
      </text>
      <text x={x + P.W - 2 * P.MARGIN - 220} y={cy + P.HEADER_H / 2 + 5} fontSize={10} fill={C.LABEL_FAINT}>
        Temperature · Pulse · Respiration · BP
      </text>
    </g>,
  );
  cy += P.HEADER_H;

  const chartLeft = x + P.LEFT_W;
  const chartRight = x + (P.W - 2 * P.MARGIN) - P.RIGHT_W;
  const headerTotalH = P.HEADER_ROWS.DATE + P.HEADER_ROWS.ADMIT + P.HEADER_ROWS.OP + P.HEADER_ROWS.TIME;

  strips.push(
    <DayHeader
      key="day-header"
      x={x}
      y={cy}
      left={chartLeft}
      right={chartRight}
      dom={dom}
      admitDate={admitDate}
      operationStartDate={operationStartDate}
    />,
  );
  cy += headerTotalH;

  // Combined Temp + Pulse panel
  strips.push(
    <TempPulsePanel
      key="temp-pulse"
      x={x}
      y={cy}
      w={P.W - 2 * P.MARGIN}
      h={P.PANEL.TEMP_PULSE}
      obs={observations}
      dom={dom}
    />,
  );
  cy += P.PANEL.TEMP_PULSE;

  // Respiration
  strips.push(
    <Strip
      key="rr"
      x={x}
      y={cy}
      w={P.W - 2 * P.MARGIN}
      h={P.PANEL.RR}
      title="Respiration"
      subtitle="/min"
      yMin={RR_AXIS.min}
      yMax={RR_AXIS.max}
      yStep={5}
      color={C.RR}
      obs={observations}
      dom={dom}
      extract={(o) => o.respiratory_rate}
      abnormal={(v) => v < 12 || v > 24}
      testid="vs-panel-rr"
    />,
  );
  cy += P.PANEL.RR;

  // Blood Pressure
  strips.push(
    <BpPanel
      key="bp"
      x={x}
      y={cy}
      w={P.W - 2 * P.MARGIN}
      h={P.PANEL.BP}
      obs={observations}
      dom={dom}
    />,
  );
  cy += P.PANEL.BP;

  return (
    <svg
      data-testid="vital-sign-chart"
      viewBox={`0 0 ${P.W} ${P.H}`}
      width="100%"
      height="auto"
      preserveAspectRatio="xMinYMin meet"
      style={{ background: C.BG, display: 'block' }}
    >
      {strips}
    </svg>
  );
}
