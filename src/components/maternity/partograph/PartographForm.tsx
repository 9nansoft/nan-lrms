// PartographForm — SVG port of Delphi HOSxPLaborPackage/PartographRenderUnit.pas.
// Renders the WHO partograph as a fixed 900×1300 sheet with all 20 strips
// (Header, CDSS banner, FHR, Liquor, Moulding, Cervix with Alert/Action lines,
// Descent, Hours, Time, Contractions strength-coded, Oxytocin U and drops,
// Drugs/IV, Pulse+BP, Temp, Urine Protein/Glucose/Ketone/Volume, Staff).
// Not a general-purpose chart — it IS the partograph form so nurses can print
// and sign it.
'use client';

import type {
  CdssAlertDto,
  CdssSeverity,
  PartographObservationDto,
} from '@/types/api';
import { countBySeverity } from '@/services/partogram';

export interface PartographFormHeader {
  an: string;
  hn?: string;
  patientName?: string;
  gpal?: string;
  age?: string;
  admitAt?: string;
}

export interface PartographFormProps {
  header: PartographFormHeader;
  observations: PartographObservationDto[];
  alerts: CdssAlertDto[];
  /** Optional click handler — when set, the chart renders a transparent
   *  clickable column overlay per observation so nurses can tap a filled
   *  hour and open the edit dialog for that row. */
  onObservationClick?: (o: PartographObservationDto) => void;
}

// ─── Page layout constants (match PartographRenderUnit.pas) ────────────────
const P = {
  W: 900,
  H: 1300,
  MARGIN: 10,
  LEFT_W: 156,
  HOUR_W: 30,
  MAX_HOURS: 24,
  ROW: {
    HDR: 84,
    CDSS: 120,
    FHR: 168,
    LIQUOR: 26,
    MOULDING: 26,
    CERVIX: 170,
    DESCENT: 90,
    HOURS: 26,
    TIME: 26,
    CONTR: 100,
    OXY_U: 26,
    OXY_D: 26,
    DRUGS: 30,
    PULSE: 140,
    TEMP: 26,
    PROT: 26,
    GLU: 26,
    KET: 26,
    VOL: 26,
    STAFF: 28,
  },
};

// Colors converted from Delphi BGR → web RGB.
const C = {
  BG: '#FFFFFF',
  ROW_ALT: '#FBF8F6',
  LINE: '#808080',
  MAJOR: '#605050',
  MINOR: '#EAE6E4',
  LABEL: '#383430',
  SECT_LBL: '#282420',
  FHR: '#143C8B',
  FHR_NORM: '#E6F0FA',
  FHR_REF: '#383430',
  DIL: '#E02020',
  DIL_OK: '#408020',
  DESC: '#606060',
  ALERT: '#808000',
  ACTION: '#A00000',
  PULSE: '#803080',
  BP: '#802020',
  TEMP: '#207020',
  TITLE: '#203870',
  HEADER_BG: '#DCE8F4',
  HEADER_BAR: '#3878B0',
  ABN: '#E84444',
  ABN_BG: '#FFE4E0',
  WARN: '#D08000',
  WARN_BG: '#F4ECDC',
  OK: '#408040',
  SHADOW: '#B0B0B0',
  CONTR_MILD: '#C0C0C0',
  CONTR_MILD_PEN: '#808080',
  CONTR_MOD: '#D08000',
  CONTR_MOD_PEN: '#A06000',
  CONTR_STRONG: '#E84444',
  CONTR_STRONG_PEN: '#C02020',
};

const chartW = P.LEFT_W + P.MAX_HOURS * P.HOUR_W;

// ─── Helpers ───────────────────────────────────────────────────────────────

function obsX(o: PartographObservationDto, firstMs: number): number {
  // Port of ObsX: prefer hour_no; fall back to derived from firstDT.
  const left = P.MARGIN + P.LEFT_W;
  if (o.hourNo && o.hourNo > 0) {
    return left + (o.hourNo - 1) * P.HOUR_W + P.HOUR_W / 2;
  }
  if (!firstMs || !o.observeDatetime) return -1;
  const hrs = (Date.parse(o.observeDatetime) - firstMs) / 3_600_000;
  return left + Math.round(hrs * P.HOUR_W) + P.HOUR_W / 2;
}

function obsHour(o: PartographObservationDto, firstMs: number): number {
  // Port of ObsHour: 0-based hour offset.
  if (o.hourNo && o.hourNo > 0) return o.hourNo - 1;
  if (!firstMs || !o.observeDatetime) return 0;
  return Math.max(0, Math.round((Date.parse(o.observeDatetime) - firstMs) / 3_600_000));
}

function firstObsMs(obs: PartographObservationDto[]): number {
  let min = 0;
  for (const o of obs) {
    if (!o.observeDatetime) continue;
    const ms = Date.parse(o.observeDatetime);
    if (!Number.isFinite(ms)) continue;
    if (min === 0 || ms < min) min = ms;
  }
  return min;
}

// Port of Delphi AbbrevAmniotic.
function abbrevAmniotic(s: string | null): string {
  if (!s) return '';
  const low = s.toLowerCase();
  if (low === 'clear' || low === 'c') return 'C';
  if (low.includes('thick')) return 'M3';
  if (low.includes('moder')) return 'M2';
  if (low.includes('mild')) return 'M1';
  if (low.includes('mec')) return 'M';
  if (low.includes('blood')) return 'B';
  if (low.includes('absent')) return 'A';
  if (low.includes('intact')) return 'I';
  if (low.includes('ruptur')) return 'R';
  return s.slice(0, 3);
}

function formatHHmm(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function severityColor(s: CdssSeverity): string {
  switch (s) {
    case 'CRITICAL': return '#B00020';
    case 'ALERT':    return '#C64F00';
    case 'WARN':     return '#A07000';
    default:         return '#306030';
  }
}

function sectionLabel(section: string): string {
  const map: Record<string, string> = {
    FHR: 'FHR', LIQUOR: 'Liquor', MOULDING: 'Moulding', CERVIX: 'Cervix',
    DESCENT: 'Descent', CONTRACTIONS: 'Contractions', OXY: 'Oxytocin',
    PULSE: 'Pulse', BP: 'BP', TEMP: 'Temp', URINE: 'Urine', TIME: 'Time',
  };
  return map[section] ?? section;
}

// ─── Primitive render helpers ──────────────────────────────────────────────

function RowLabel({ x, y, w, h, title, subtitle }: {
  x: number; y: number; w: number; h: number; title: string; subtitle?: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={C.ROW_ALT} />
      <line x1={x + w} y1={y} x2={x + w} y2={y + h} stroke={C.LINE} />
      {subtitle ? (
        <>
          <text x={x + 8} y={y + 14} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>{title}</text>
          <text x={x + 8} y={y + 26} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>{subtitle}</text>
        </>
      ) : (
        <text x={x + 8} y={y + h / 2 + 4} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>{title}</text>
      )}
    </g>
  );
}

function HourGrid({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  // Vertical major lines at every hour boundary + outer frame top/bottom.
  const lines: React.ReactElement[] = [];
  for (let i = 0; i <= P.MAX_HOURS; i++) {
    const px = x + i * P.HOUR_W;
    lines.push(<line key={`v${i}`} x1={px} y1={y} x2={px} y2={y + h} stroke={C.MAJOR} strokeWidth={0.5} />);
  }
  lines.push(<line key="top" x1={x} y1={y} x2={x + w} y2={y} stroke={C.MAJOR} />);
  lines.push(<line key="bot" x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={C.MAJOR} />);
  return <g>{lines}</g>;
}

function StripFrame({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} fill="none" stroke={C.LINE} />;
}

// ─── Strip: Header ─────────────────────────────────────────────────────────

function HeaderStrip({ x, y, w, h, header }: {
  x: number; y: number; w: number; h: number; header: PartographFormHeader;
}) {
  const line1 = `AN: ${header.an}    HN: ${header.hn ?? ''}    ${header.patientName ?? ''}    ${header.gpal ?? ''}`;
  const line2Parts = [] as string[];
  if (header.age) line2Parts.push(`Age: ${header.age}`);
  if (header.admitAt) {
    const ms = Date.parse(header.admitAt);
    if (Number.isFinite(ms)) {
      const d = new Date(ms);
      const p = (n: number) => n.toString().padStart(2, '0');
      line2Parts.push(`Admitted: ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`);
    }
  }
  return (
    <g data-testid="strip-header">
      <rect x={x} y={y} width={w} height={h} fill={C.HEADER_BG} />
      <rect x={x} y={y} width={w} height={3} fill={C.HEADER_BAR} />
      <line x1={x} y1={y + h} x2={x + w} y2={y + h} stroke={C.LINE} />
      {/* Title with drop-shadow */}
      <text x={x + 16} y={y + 30} fontSize={20} fontWeight={800} fill={C.SHADOW}>PARTOGRAPH</text>
      <text x={x + 14} y={y + 28} fontSize={20} fontWeight={800} fill={C.TITLE}>PARTOGRAPH</text>
      <text x={x + w - 180} y={y + 30} fontSize={10} fill={C.LINE}>LABOUR PROGRESS MONITORING</text>
      <text x={x + 14} y={y + 54} fontSize={11} fill={C.LABEL}>{line1}</text>
      {line2Parts.length > 0 && (
        <text x={x + 14} y={y + 72} fontSize={10} fill={C.LINE}>{line2Parts.join('      ')}</text>
      )}
    </g>
  );
}

// ─── Strip: CDSS banner ────────────────────────────────────────────────────

function CdssBanner({ x, y, w, h, alerts }: {
  x: number; y: number; w: number; h: number; alerts: CdssAlertDto[];
}) {
  const nCrit = countBySeverity(alerts, 'CRITICAL');
  const nAlert = countBySeverity(alerts, 'ALERT');
  const nWarn = countBySeverity(alerts, 'WARN');
  let headline = 'CDSS - ผลตรวจอยู่ในเกณฑ์ปกติ';
  let bg = '#E4F2E4';
  let accent = C.OK;
  if (nCrit > 0) { headline = 'CDSS - ต้องประเมินด่วน'; bg = '#FCE6E6'; accent = severityColor('CRITICAL'); }
  else if (nAlert > 0) { headline = 'CDSS - แจ้งเตือน'; bg = '#FCF1E6'; accent = severityColor('ALERT'); }
  else if (nWarn > 0) { headline = 'CDSS - เฝ้าระวัง'; bg = '#FCF6EE'; accent = severityColor('WARN'); }

  // Sort alerts by severity desc; show up to 4 rows.
  const rank: Record<CdssSeverity, number> = { CRITICAL: 3, ALERT: 2, WARN: 1, INFO: 0 };
  const sorted = [...alerts].sort((a, b) => rank[b.severity] - rank[a.severity]);
  const shown = sorted.slice(0, 4);
  const remaining = sorted.length - shown.length;

  // Right-aligned severity pills.
  const pills: React.ReactElement[] = [];
  let pillX = x + w - 10;
  function pill(label: string, color: string) {
    const pillW = label.length * 7 + 14;
    pills.push(
      <g key={label}>
        <rect x={pillX - pillW} y={y + 8} width={pillW} height={22} fill={color} rx={3} />
        <text x={pillX - pillW + 7} y={y + 24} fontSize={11} fontWeight={700} fill="#fff">{label}</text>
      </g>,
    );
    pillX -= pillW + 6;
  }
  if (nWarn > 0) pill(`ระวัง ${nWarn}`, severityColor('WARN'));
  if (nAlert > 0) pill(`เตือน ${nAlert}`, severityColor('ALERT'));
  if (nCrit > 0) pill(`วิกฤต ${nCrit}`, severityColor('CRITICAL'));

  return (
    <g data-testid="strip-cdss">
      <rect x={x} y={y} width={w} height={h} fill={bg} />
      <line x1={x} y1={y + h - 1} x2={x + w} y2={y + h - 1} stroke={C.LINE} />
      <rect x={x} y={y} width={10} height={h} fill={accent} />
      <text x={x + 22} y={y + 24} fontSize={15} fontWeight={800} fill={accent}>{headline}</text>
      <line x1={x + 22} y1={y + 36} x2={x + w - 10} y2={y + 36} stroke={C.LINE} />
      {pills}
      {shown.map((a, i) => {
        const ry = y + 44 + i * 22;
        return (
          <g key={i}>
            <rect x={x + 22} y={ry} width={98} height={19} fill={severityColor(a.severity)} rx={2} />
            <text x={x + 71} y={ry + 14} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">
              {a.severity === 'CRITICAL' ? 'วิกฤต' : a.severity === 'ALERT' ? 'เตือน' : a.severity === 'WARN' ? 'ระวัง' : 'ข้อมูล'}
            </text>
            <text x={x + 130} y={ry + 14} fontSize={12} fill={C.LABEL}>
              {sectionLabel(a.section)}: {a.message}
            </text>
          </g>
        );
      })}
      {remaining > 0 && (
        <text x={x + 22} y={y + 44 + shown.length * 22 + 14} fontSize={11} fontWeight={700} fill={C.LINE}>
          +อีก {remaining} รายการ - ดูรายการเต็มในแท็บข้อมูล
        </text>
      )}
    </g>
  );
}

// ─── Strip: FHR ────────────────────────────────────────────────────────────

function FhrStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartTop = y + 8;
  const chartRight = x + w;
  const chartBottom = y + h - 10;
  const yMin = 100, yMax = 180;
  const yToPx = (v: number) => chartBottom - ((v - yMin) / (yMax - yMin)) * (chartBottom - chartTop);
  const y120 = yToPx(120);
  const y160 = yToPx(160);

  // Build the points.
  const points = obs
    .filter((o) => o.fetalHeartRate != null && o.fetalHeartRate > 0)
    .map((o) => {
      const v = Math.max(yMin, Math.min(yMax, o.fetalHeartRate!));
      return { o, px: obsX(o, firstMs), py: yToPx(v) };
    })
    .filter((p) => p.px >= chartLeft && p.px <= chartRight);

  // Gridlines every 10 bpm.
  const grid: React.ReactElement[] = [];
  for (let v = yMin; v <= yMax; v += 10) {
    const gy = yToPx(v);
    grid.push(<line key={`g${v}`} x1={chartLeft} y1={gy} x2={chartRight} y2={gy} stroke={C.MINOR} />);
    grid.push(<text key={`t${v}`} x={chartLeft - 22} y={gy + 4} fontSize={9} fill={C.LABEL}>{v}</text>);
  }

  return (
    <g data-testid="strip-fhr">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="FETAL HEART" subtitle="RATE (bpm)" />
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} />
      {/* Normal band 120–160 */}
      <rect x={chartLeft} y={y160} width={chartRight - chartLeft} height={y120 - y160} fill={C.FHR_NORM} />
      {grid}
      <HourGrid x={chartLeft} y={chartTop} w={chartRight - chartLeft} h={chartBottom - chartTop} />
      {/* 120 / 160 ref lines */}
      <line x1={chartLeft} y1={y120} x2={chartRight} y2={y120} stroke={C.FHR_REF} strokeWidth={2} />
      <line x1={chartLeft} y1={y160} x2={chartRight} y2={y160} stroke={C.FHR_REF} strokeWidth={2} />
      {/* Connector line between points */}
      {points.slice(1).map((p, i) => (
        <line key={`l${i}`} x1={points[i].px} y1={points[i].py} x2={p.px} y2={p.py}
              stroke={C.FHR} strokeWidth={2} />
      ))}
      {/* Dots + abnormal labels */}
      {points.map((p) => {
        const v = p.o.fetalHeartRate!;
        const abn = v < 110 || v > 160;
        return (
          <g key={p.o.id}>
            <circle cx={p.px} cy={p.py} r={4}
                    fill={abn ? C.ABN : C.FHR}
                    stroke={abn ? C.ABN : C.FHR}
                    data-abnormal={abn ? 'true' : undefined} />
            {abn && (
              <g>
                <rect x={p.px + 6} y={p.py - 9} width={30} height={13} fill="#fff" />
                <text x={p.px + 9} y={p.py + 1} fontSize={10} fontWeight={700} fill={C.ABN}>{v}</text>
              </g>
            )}
          </g>
        );
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Categorical row (Liquor / Moulding / Urine × 4 / Oxy × 2 / Drugs / Temp / Staff) ──

type CategoricalKind =
  | 'amniotic' | 'moulding' | 'protein' | 'acetone' | 'ketone' | 'glucose'
  | 'staff' | 'volume' | 'drugs' | 'oxy_u' | 'oxy_d' | 'temp';

function extractValue(o: PartographObservationDto, kind: CategoricalKind): string {
  switch (kind) {
    case 'amniotic':  return abbrevAmniotic(o.amnioticFluid);
    case 'moulding':  return o.moulding ?? '';
    case 'protein':   return o.urineProtein ?? '';
    case 'acetone':   return o.urineAcetone ?? '';
    // Delphi DrawCategoricalRow(kind='ketone') also reads UrineAcetone — HOSxP
    // uses acetone/ketone interchangeably. Preserve that behaviour.
    case 'ketone':    return o.urineAcetone ?? '';
    case 'glucose':   return o.urineGlucose ?? '';
    case 'staff':     return o.entryStaff ?? '';
    case 'volume':    return o.urineVolumeMl && o.urineVolumeMl > 0 ? String(o.urineVolumeMl) : '';
    case 'drugs':     return o.drugsIvFluids ?? '';
    case 'oxy_u':     return o.oxytocinUml && o.oxytocinUml > 0 ? o.oxytocinUml.toString() : '';
    case 'oxy_d':     return o.oxytocinDropsMin && o.oxytocinDropsMin > 0 ? String(o.oxytocinDropsMin) : '';
    case 'temp':      return o.temperature && o.temperature > 0 ? o.temperature.toFixed(1) : '';
  }
}

interface CategoricalCellStyle { bg?: string; color: string; bold: boolean; }

function cellStyle(kind: CategoricalKind, value: string, obs: PartographObservationDto): CategoricalCellStyle {
  if (kind === 'temp' && obs.temperature != null && obs.temperature >= 38) {
    return { bg: C.ABN_BG, color: C.ABN, bold: true };
  }
  if (kind === 'protein' || kind === 'acetone' || kind === 'ketone' || kind === 'glucose') {
    if (value.includes('++')) return { bg: C.ABN_BG, color: C.ABN, bold: true };
    if (value.includes('+') || value.toLowerCase().includes('trace')) {
      return { bg: C.WARN_BG, color: C.WARN, bold: true };
    }
  }
  if (kind === 'amniotic' && (value === 'M1' || value === 'M2' || value === 'M3' || value === 'B')) {
    return { bg: C.WARN_BG, color: C.WARN, bold: true };
  }
  if (kind === 'moulding' && value.includes('++')) {
    return { bg: C.WARN_BG, color: C.WARN, bold: true };
  }
  if (kind === 'oxy_u' || kind === 'oxy_d') {
    return { color: C.BP, bold: true };
  }
  return { color: C.LABEL, bold: false };
}

function CategoricalStrip({
  x, y, w, h, label, kind, obs, firstMs, testid,
}: {
  x: number; y: number; w: number; h: number;
  label: string; kind: CategoricalKind;
  obs: PartographObservationDto[]; firstMs: number; testid: string;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w;
  const chartW = chartRight - chartLeft;

  return (
    <g data-testid={testid}>
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title={label} />
      <rect x={chartLeft} y={y} width={chartW} height={h} fill={C.BG} />
      <HourGrid x={chartLeft} y={y} w={chartW} h={h} />
      {obs.map((o) => {
        const v = extractValue(o, kind);
        if (!v) return null;
        const px = obsX(o, firstMs);
        if (px < chartLeft || px > chartRight) return null;
        const s = cellStyle(kind, v, o);
        const cellX = px - P.HOUR_W / 2;
        const display = kind !== 'amniotic' && v.length > 12 ? v.slice(0, 11) + '…' : v;
        return (
          <g key={o.id}>
            {s.bg && <rect x={cellX} y={y} width={P.HOUR_W} height={h} fill={s.bg} />}
            <text
              x={px}
              y={y + h / 2 + 4}
              fontSize={11}
              fontWeight={s.bold ? 700 : 400}
              fill={s.color}
              textAnchor="middle"
            >
              {display}
            </text>
          </g>
        );
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Cervix (Plot X + Alert/Action lines + phase headers) ───────────

function CervixStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartTop = y + 18;
  const chartRight = x + w;
  const chartBottom = y + h - 2;
  const yMin = 1, yMax = 10;
  const yToPx = (v: number) => chartBottom - ((v - yMin) / (yMax - yMin)) * (chartBottom - chartTop);

  // Compute alert/action anchor: first observation with dilation >= 4.
  let firstDilHour = 0;
  let dilCm = 4;
  for (const o of obs) {
    if (o.cervicalDilationCm != null && o.cervicalDilationCm >= 4) {
      firstDilHour = obsHour(o, firstMs);
      dilCm = o.cervicalDilationCm;
      break;
    }
  }

  const activeX = chartLeft + firstDilHour * P.HOUR_W + P.HOUR_W / 2;
  const alertStartX = activeX;
  const alertStartY = yToPx(dilCm);
  const alertEndX = Math.min(chartRight, chartLeft + (firstDilHour + Math.round(10 - dilCm)) * P.HOUR_W + P.HOUR_W / 2);
  const alertEndY = yToPx(10);
  const actionStartX = alertStartX + 4 * P.HOUR_W;
  const actionEndX = Math.min(chartRight, alertEndX + 4 * P.HOUR_W);

  // Gridlines every 1 cm.
  const grid: React.ReactElement[] = [];
  for (let v = yMin; v <= yMax; v++) {
    const gy = yToPx(v);
    grid.push(<line key={`g${v}`} x1={chartLeft} y1={gy} x2={chartRight} y2={gy} stroke={C.MINOR} />);
    grid.push(<text key={`t${v}`} x={chartLeft - 14} y={gy + 4} fontSize={9} fill={C.LABEL}>{v}</text>);
  }

  return (
    <g data-testid="strip-cervix">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="CERVIX (cm)" subtitle="Plot X" />
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} />
      {grid}
      <HourGrid x={chartLeft} y={chartTop} w={chartRight - chartLeft} h={chartBottom - chartTop} />
      {/* Phase labels */}
      {firstDilHour > 0 && (
        <text x={chartLeft + (firstDilHour * P.HOUR_W) / 2 - 30} y={y + 14} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>
          LATENT PHASE
        </text>
      )}
      <text x={activeX + 10} y={y + 14} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>
        ACTIVE PHASE
      </text>
      <line x1={activeX} y1={y} x2={activeX} y2={chartTop - 1} stroke={C.MAJOR} />
      {/* Alert line (solid olive) */}
      <line
        data-testid="cervix-alert-line"
        x1={alertStartX} y1={alertStartY} x2={alertEndX} y2={alertEndY}
        stroke={C.ALERT} strokeWidth={2}
      />
      {/* Action line (dashed maroon) */}
      {actionStartX < chartRight && (
        <line
          data-testid="cervix-action-line"
          x1={actionStartX} y1={alertStartY} x2={actionEndX} y2={alertEndY}
          stroke={C.ACTION} strokeWidth={2} strokeDasharray="6 4"
        />
      )}
      {/* Diagonal text labels */}
      {(() => {
        const mx = (alertStartX + alertEndX) / 2;
        const my = (alertStartY + alertEndY) / 2;
        const angle = (Math.atan2(alertEndY - alertStartY, alertEndX - alertStartX) * 180) / Math.PI;
        return (
          <>
            <text x={mx} y={my - 6} fontSize={11} fontWeight={700} fill={C.ALERT}
                  transform={`rotate(${angle}, ${mx}, ${my})`} textAnchor="middle">
              ALERT
            </text>
            {actionStartX < chartRight && (
              <text x={(actionStartX + actionEndX) / 2} y={my - 6} fontSize={11} fontWeight={700} fill={C.ACTION}
                    transform={`rotate(${angle}, ${(actionStartX + actionEndX) / 2}, ${my})`} textAnchor="middle">
                ACTION
              </text>
            )}
          </>
        );
      })()}
      {/* Plot X marks */}
      {obs
        .filter((o) => o.cervicalDilationCm != null && o.cervicalDilationCm > 0)
        .map((o) => {
          const px = obsX(o, firstMs);
          if (px < chartLeft || px > chartRight) return null;
          const v = o.cervicalDilationCm!;
          const py = yToPx(v);
          // Color-code: red if behind alert line, green if ahead.
          const expected = dilCm + (obsHour(o, firstMs) - firstDilHour);
          const behind = v < expected;
          const color = behind ? C.ABN : C.DIL_OK;
          return (
            <g key={o.id} data-role="cervix-x">
              <line x1={px - 6} y1={py - 6} x2={px + 7} y2={py + 7} stroke={color} strokeWidth={2} />
              <line x1={px - 6} y1={py + 6} x2={px + 7} y2={py - 7} stroke={color} strokeWidth={2} />
            </g>
          );
        })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Descent (Plot O) ───────────────────────────────────────────────

function DescentStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartTop = y + 8;
  const chartRight = x + w;
  const chartBottom = y + h - 8;
  const yMin = 0, yMax = 5;
  const yToPx = (v: number) => chartBottom - ((v - yMin) / (yMax - yMin)) * (chartBottom - chartTop);

  const grid: React.ReactElement[] = [];
  for (let v = yMin; v <= yMax; v++) {
    const gy = yToPx(v);
    grid.push(<line key={`g${v}`} x1={chartLeft} y1={gy} x2={chartRight} y2={gy} stroke={C.MINOR} />);
    grid.push(<text key={`t${v}`} x={chartLeft - 12} y={gy + 4} fontSize={9} fill={C.LABEL}>{v}</text>);
  }

  return (
    <g data-testid="strip-descent">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="DESCENT" subtitle="Plot O   (5..0)" />
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} />
      {grid}
      <HourGrid x={chartLeft} y={chartTop} w={chartRight - chartLeft} h={chartBottom - chartTop} />
      {obs.map((o) => {
        if (!o.descentOfHead) return null;
        const vd = parseInt(o.descentOfHead.charAt(0), 10);
        if (!Number.isFinite(vd) || vd < 0 || vd > 5) return null;
        const px = obsX(o, firstMs);
        if (px < chartLeft || px > chartRight) return null;
        const py = yToPx(vd);
        return <circle key={o.id} cx={px} cy={py} r={5} fill="none" stroke={C.DESC} strokeWidth={2} />;
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Hours row ──────────────────────────────────────────────────────

function HoursStrip({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w;
  const cells: React.ReactElement[] = [];
  for (let i = 1; i <= P.MAX_HOURS; i++) {
    const cx = chartLeft + (i - 1) * P.HOUR_W + P.HOUR_W / 2;
    cells.push(
      <text key={i} x={cx} y={y + h / 2 + 4} fontSize={11} fontWeight={700} fill={C.SECT_LBL} textAnchor="middle">
        {i}
      </text>,
    );
  }
  return (
    <g data-testid="strip-hours">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="HOURS" />
      <rect x={chartLeft} y={y} width={chartRight - chartLeft} height={h} fill={C.ROW_ALT} />
      <HourGrid x={chartLeft} y={y} w={chartRight - chartLeft} h={h} />
      {cells}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Time row ───────────────────────────────────────────────────────

function TimeStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartRight = x + w;
  return (
    <g data-testid="strip-time">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="TIME" />
      <rect x={chartLeft} y={y} width={chartRight - chartLeft} height={h} fill={C.BG} />
      <HourGrid x={chartLeft} y={y} w={chartRight - chartLeft} h={h} />
      {obs.map((o) => {
        if (!o.observeDatetime) return null;
        const px = obsX(o, firstMs);
        if (px < chartLeft || px > chartRight) return null;
        return (
          <text key={o.id} x={px} y={y + h / 2 + 4} fontSize={9} fill={C.LABEL} textAnchor="middle">
            {formatHHmm(o.observeDatetime)}
          </text>
        );
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Contractions (strength-coded stack) ────────────────────────────

function ContractionsStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartTop = y + 2;
  const chartRight = x + w;
  const chartBottom = y + h - 2;
  const cellH = (chartBottom - chartTop) / 5;

  // Row labels / legend on the left-most column.
  const rowGrid: React.ReactElement[] = [];
  for (let j = 0; j <= 5; j++) {
    const ly = chartTop + j * cellH;
    rowGrid.push(<line key={`r${j}`} x1={chartLeft} y1={ly} x2={chartRight} y2={ly} stroke={C.MINOR} />);
    if (j >= 1 && j <= 5) {
      rowGrid.push(
        <text key={`rt${j}`} x={chartLeft - 10} y={chartTop + (5 - j) * cellH + cellH / 2 + 4} fontSize={9} fill={C.LABEL}>
          {j}
        </text>,
      );
    }
  }

  return (
    <g data-testid="strip-contractions">
      {/* Label column */}
      <rect x={x} y={y} width={P.LEFT_W} height={h} fill={C.ROW_ALT} />
      <line x1={x + P.LEFT_W} y1={y} x2={x + P.LEFT_W} y2={y + h} stroke={C.LINE} />
      <text x={x + 8} y={y + 14} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>CONTRACTIONS</text>
      <text x={x + 8} y={y + 26} fontSize={10} fontWeight={700} fill={C.SECT_LBL}>PER 10 MIN</text>
      {/* Legend swatches */}
      {[
        { yOff: 38, fill: C.CONTR_MILD, stroke: C.CONTR_MILD_PEN, label: 'mild  <25 sec' },
        { yOff: 54, fill: C.CONTR_MOD, stroke: C.CONTR_MOD_PEN, label: 'mod   25–40 s' },
        { yOff: 70, fill: C.CONTR_STRONG, stroke: C.CONTR_STRONG_PEN, label: 'strong >40 s' },
      ].map((l) => (
        <g key={l.label}>
          <rect x={x + 8} y={y + l.yOff} width={12} height={10} fill={l.fill} stroke={l.stroke} />
          <text x={x + 24} y={y + l.yOff + 9} fontSize={9} fill={C.LABEL}>{l.label}</text>
        </g>
      ))}
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} />
      {rowGrid}
      <HourGrid x={chartLeft} y={chartTop} w={chartRight - chartLeft} h={chartBottom - chartTop} />
      {/* Stacked cells per observation */}
      {obs.map((o) => {
        const cnt = o.contractionPer10Min ?? 0;
        if (cnt <= 0) return null;
        const n = Math.min(5, cnt);
        const px = obsX(o, firstMs);
        if (px < chartLeft || px > chartRight) return null;
        const streng = (o.contractionStrength ?? '').toLowerCase();
        const strength = streng.includes('strong') ? 'strong' : streng.includes('moder') ? 'moderate' : 'mild';
        const fill =
          strength === 'strong' ? C.CONTR_STRONG :
          strength === 'moderate' ? C.CONTR_MOD : C.CONTR_MILD;
        const stroke =
          strength === 'strong' ? C.CONTR_STRONG_PEN :
          strength === 'moderate' ? C.CONTR_MOD_PEN : C.CONTR_MILD_PEN;
        const cells: React.ReactElement[] = [];
        for (let j = 1; j <= n; j++) {
          const cy0 = chartBottom - j * cellH + 1;
          cells.push(
            <rect
              key={j}
              data-strength={strength}
              x={px - 10}
              y={cy0}
              width={20}
              height={cellH - 2}
              fill={fill}
              stroke={stroke}
            />,
          );
        }
        return <g key={o.id}>{cells}</g>;
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Strip: Pulse + BP ─────────────────────────────────────────────────────

function PulseBpStrip({ x, y, w, h, obs, firstMs }: {
  x: number; y: number; w: number; h: number;
  obs: PartographObservationDto[]; firstMs: number;
}) {
  const chartLeft = x + P.LEFT_W;
  const chartTop = y + 2;
  const chartRight = x + w;
  const chartBottom = y + h - 2;
  const yMin = 60, yMax = 180;
  const yToPx = (v: number) => chartBottom - ((v - yMin) / (yMax - yMin)) * (chartBottom - chartTop);

  const grid: React.ReactElement[] = [];
  for (let v = yMin; v <= yMax; v += 20) {
    const gy = yToPx(v);
    grid.push(<line key={`g${v}`} x1={chartLeft} y1={gy} x2={chartRight} y2={gy} stroke={C.MINOR} />);
    grid.push(<text key={`t${v}`} x={chartLeft - 22} y={gy + 4} fontSize={9} fill={C.LABEL}>{v}</text>);
  }

  // Pulse polyline.
  const pulsePoints = obs
    .filter((o) => o.pulse != null && o.pulse > 0)
    .map((o) => {
      const v = Math.max(yMin, Math.min(yMax, o.pulse!));
      return { o, px: obsX(o, firstMs), py: yToPx(v) };
    })
    .filter((p) => p.px >= chartLeft && p.px <= chartRight);

  return (
    <g data-testid="strip-pulse-bp">
      <RowLabel x={x} y={y} w={P.LEFT_W} h={h} title="PULSE (.) &" subtitle="BP (arrows)" />
      <rect x={chartLeft} y={chartTop} width={chartRight - chartLeft} height={chartBottom - chartTop} fill={C.BG} />
      {grid}
      <HourGrid x={chartLeft} y={chartTop} w={chartRight - chartLeft} h={chartBottom - chartTop} />
      {/* Pulse connector */}
      {pulsePoints.slice(1).map((p, i) => (
        <line key={`pl${i}`} x1={pulsePoints[i].px} y1={pulsePoints[i].py} x2={p.px} y2={p.py}
              stroke={C.PULSE} strokeWidth={2} />
      ))}
      {/* Pulse dots */}
      {pulsePoints.map((p) => {
        const abn = p.o.pulse! < 60 || p.o.pulse! > 100;
        return (
          <circle key={p.o.id} cx={p.px} cy={p.py} r={3}
                  fill={abn ? C.ABN : C.PULSE}
                  stroke={abn ? C.ABN : C.PULSE}
                  data-role="pulse-dot" />
        );
      })}
      {/* BP arrows */}
      {obs.map((o) => {
        const bps = o.bpSystolic ?? 0;
        const bpd = o.bpDiastolic ?? 0;
        if (bps <= 0 && bpd <= 0) return null;
        const px = obsX(o, firstMs);
        if (px < chartLeft || px > chartRight) return null;
        const abn = bps >= 140 || bpd >= 90;
        const color = abn ? C.ABN : C.BP;
        const pysys = bps > 0 ? yToPx(Math.min(yMax, bps)) : chartBottom;
        const pydia = bpd > 0 ? yToPx(Math.max(yMin, Math.min(yMax, bpd))) : chartBottom;
        return (
          <g key={o.id} data-role="bp-pair">
            {bps > 0 && bpd > 0 && (
              <line x1={px} y1={pysys} x2={px} y2={pydia} stroke={color} strokeWidth={2} />
            )}
            {bps > 0 && (
              <>
                <line x1={px} y1={pysys} x2={px - 4} y2={pysys + 6} stroke={color} strokeWidth={2} />
                <line x1={px} y1={pysys} x2={px + 4} y2={pysys + 6} stroke={color} strokeWidth={2} />
              </>
            )}
            {bpd > 0 && (
              <>
                <line x1={px} y1={pydia} x2={px - 4} y2={pydia - 6} stroke={color} strokeWidth={2} />
                <line x1={px} y1={pydia} x2={px + 4} y2={pydia - 6} stroke={color} strokeWidth={2} />
              </>
            )}
          </g>
        );
      })}
      <StripFrame x={x} y={y} w={w} h={h} />
    </g>
  );
}

// ─── Main component: stack strips top-down ────────────────────────────────

export function PartographForm({
  header,
  observations,
  alerts,
  onObservationClick,
}: PartographFormProps) {
  const firstMs = firstObsMs(observations);
  const x = P.MARGIN;
  // Emit strips at absolute y coordinates — the running cursor is local to
  // this function so each strip knows its own origin.
  const emit: React.ReactElement[] = [];
  let cy = P.MARGIN;
  const push = (el: React.ReactElement, h: number) => {
    emit.push(<g key={emit.length}>{el}</g>);
    cy += h;
  };

  push(<HeaderStrip x={x} y={cy} w={chartW} h={P.ROW.HDR} header={header} />, P.ROW.HDR);
  push(<CdssBanner x={x} y={cy} w={chartW} h={P.ROW.CDSS} alerts={alerts} />, P.ROW.CDSS);
  push(<FhrStrip x={x} y={cy} w={chartW} h={P.ROW.FHR} obs={observations} firstMs={firstMs} />, P.ROW.FHR);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.LIQUOR} label="LIQUOR" kind="amniotic" obs={observations} firstMs={firstMs} testid="strip-liquor" />, P.ROW.LIQUOR);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.MOULDING} label="MOULDING" kind="moulding" obs={observations} firstMs={firstMs} testid="strip-moulding" />, P.ROW.MOULDING);
  push(<CervixStrip x={x} y={cy} w={chartW} h={P.ROW.CERVIX} obs={observations} firstMs={firstMs} />, P.ROW.CERVIX);
  push(<DescentStrip x={x} y={cy} w={chartW} h={P.ROW.DESCENT} obs={observations} firstMs={firstMs} />, P.ROW.DESCENT);
  push(<HoursStrip x={x} y={cy} w={chartW} h={P.ROW.HOURS} />, P.ROW.HOURS);
  push(<TimeStrip x={x} y={cy} w={chartW} h={P.ROW.TIME} obs={observations} firstMs={firstMs} />, P.ROW.TIME);
  push(<ContractionsStrip x={x} y={cy} w={chartW} h={P.ROW.CONTR} obs={observations} firstMs={firstMs} />, P.ROW.CONTR);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.OXY_U} label="OXYTOCIN U/500mL" kind="oxy_u" obs={observations} firstMs={firstMs} testid="strip-oxy-u" />, P.ROW.OXY_U);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.OXY_D} label="OXYTOCIN drops/min" kind="oxy_d" obs={observations} firstMs={firstMs} testid="strip-oxy-d" />, P.ROW.OXY_D);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.DRUGS} label="DRUGS / IV FLUIDS" kind="drugs" obs={observations} firstMs={firstMs} testid="strip-drugs" />, P.ROW.DRUGS);
  push(<PulseBpStrip x={x} y={cy} w={chartW} h={P.ROW.PULSE} obs={observations} firstMs={firstMs} />, P.ROW.PULSE);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.TEMP} label="TEMP (C)" kind="temp" obs={observations} firstMs={firstMs} testid="strip-temp" />, P.ROW.TEMP);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.PROT} label="URINE PROTEIN" kind="protein" obs={observations} firstMs={firstMs} testid="strip-urine-protein" />, P.ROW.PROT);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.GLU} label="URINE GLUCOSE" kind="glucose" obs={observations} firstMs={firstMs} testid="strip-urine-glucose" />, P.ROW.GLU);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.KET} label="URINE KETONE" kind="ketone" obs={observations} firstMs={firstMs} testid="strip-urine-ketone" />, P.ROW.KET);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.VOL} label="URINE VOLUME (mL)" kind="volume" obs={observations} firstMs={firstMs} testid="strip-urine-volume" />, P.ROW.VOL);
  push(<CategoricalStrip x={x} y={cy} w={chartW} h={P.ROW.STAFF} label="NAME OF STAFF" kind="staff" obs={observations} firstMs={firstMs} testid="strip-staff" />, P.ROW.STAFF);

  // Click overlay — one transparent rect per observation column, spanning the
  // data-strip height (below the CDSS banner, above the bottom of the sheet).
  // Gives nurses a single-click affordance to jump from "the X on the chart"
  // into the partograph entry dialog for that row.
  if (onObservationClick && observations.length > 0) {
    const overlayTop = P.MARGIN + P.ROW.HDR + P.ROW.CDSS;
    const overlayBottom = cy;
    const overlays = observations.map((o) => {
      const px = obsX(o, firstMs);
      const chartLeft = P.MARGIN + P.LEFT_W;
      const chartRight = P.MARGIN + chartW;
      if (px < chartLeft || px > chartRight) return null;
      return (
        <rect
          key={o.id}
          data-testid={`obs-click-target-${o.id}`}
          x={px - P.HOUR_W / 2}
          y={overlayTop}
          width={P.HOUR_W}
          height={overlayBottom - overlayTop}
          fill="transparent"
          style={{ cursor: 'pointer' }}
          onClick={() => onObservationClick(o)}
        >
          <title>คลิกเพื่อแก้ไข</title>
        </rect>
      );
    });
    emit.push(<g key="click-overlay">{overlays}</g>);
  }

  return (
    <svg
      data-testid="partograph-form"
      viewBox={`0 0 ${P.W} ${P.H}`}
      width="100%"
      height="auto"
      preserveAspectRatio="xMinYMin meet"
      style={{ background: C.BG, display: 'block' }}
    >
      {emit}
    </svg>
  );
}
