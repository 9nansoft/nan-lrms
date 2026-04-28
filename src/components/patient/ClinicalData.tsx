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
  HeartPulse,
  Thermometer,
  Wind,
  Stethoscope,
} from 'lucide-react';
import type { ReactNode } from 'react';

interface ClinicalDataProps {
  gravida: number | null;
  para?: number | null;
  abortion?: number | null;
  livingChildren?: number | null;
  pregNo?: number | null;
  gaWeeks: number | null;
  gaDay?: number | null;
  ancCount: number | null;
  heightCm: number | null;
  weightKg?: number | null;
  weightDiffKg: number | null;
  prePregnancyWeightKg?: number | null;
  fundalHeightCm: number | null;
  usWeightG: number | null;
  hematocritPct: number | null;
  // Admission snapshot — vitals + cervical exam at the moment of ipt admission.
  bpSystolicAdmit?: number | null;
  bpDiastolicAdmit?: number | null;
  pulseAdmit?: number | null;
  rrAdmit?: number | null;
  temperatureAdmit?: number | null;
  cervicalOpenCmAdmit?: number | null;
  effacementPctAdmit?: number | null;
  stationAdmit?: string | null;
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
// Admission BP — pre-eclampsia / hypertensive thresholds. Both systolic and
// diastolic contribute; the more severe wins.
function sevAdmitBp(sys: number | null | undefined, dia: number | null | undefined): Severity {
  if (sys == null && dia == null) return 'neutral';
  const s = sys ?? 0;
  const d = dia ?? 0;
  if (s >= 160 || d >= 110) return 'abnormal';     // severe HT
  if (s >= 140 || d >= 90)  return 'borderline';   // gestational HT
  if (s < 90 || d < 60)     return 'borderline';   // hypotension
  return 'normal';
}
function sevAdmitTemp(c: number | null | undefined): Severity {
  if (c == null) return 'neutral';
  if (c >= 38.5 || c < 35.5) return 'abnormal';
  if (c >= 37.5) return 'borderline';
  return 'normal';
}
function sevAdmitPulse(p: number | null | undefined): Severity {
  if (p == null) return 'neutral';
  if (p >= 120 || p < 50) return 'abnormal';
  if (p >= 100 || p < 60) return 'borderline';
  return 'normal';
}
function sevAdmitCervix(cm: number | null | undefined): Severity {
  if (cm == null) return 'neutral';
  if (cm >= 8) return 'abnormal';        // late presentation — plan urgent transfer
  if (cm >= 4) return 'borderline';      // active phase
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
  para,
  abortion,
  livingChildren,
  pregNo,
  gaWeeks,
  gaDay,
  ancCount,
  heightCm,
  weightKg,
  weightDiffKg,
  prePregnancyWeightKg,
  fundalHeightCm,
  usWeightG,
  hematocritPct,
  bpSystolicAdmit,
  bpDiastolicAdmit,
  pulseAdmit,
  rrAdmit,
  temperatureAdmit,
  cervicalOpenCmAdmit,
  effacementPctAdmit,
  stationAdmit,
}: ClinicalDataProps) {
  // Prefer the explicitly-supplied pre-pregnancy weight (from first ANC visit).
  // Fall back to the previous "current_weight - weight_diff" derivation when
  // pre-preg isn't available — keeps the panel readable for older rows.
  const preWeight =
    prePregnancyWeightKg ??
    (weightKg != null && weightDiffKg != null && weightKg > 0 && weightDiffKg > 0
      ? weightKg - weightDiffKg
      : null);
  const hasFullWeight = weightKg != null && preWeight != null;
  // Compute weight gain from anchors when sender didn't pre-compute it.
  const effectiveWeightDiff =
    weightDiffKg ??
    (weightKg != null && prePregnancyWeightKg != null
      ? Number((weightKg - prePregnancyWeightKg).toFixed(1))
      : null);

  // Format G_P_A_L formula — show the pieces sender supplied; gracefully
  // collapse to "G3" when only gravida is known.
  const gpalText = (() => {
    if (gravida == null) return null;
    const parts = [`G${gravida}`];
    if (para != null) parts.push(`P${para}`);
    if (abortion != null) parts.push(`A${abortion}`);
    if (livingChildren != null) parts.push(`L${livingChildren}`);
    return parts.join(' ');
  })();
  const gaText = (() => {
    if (gaWeeks == null) return null;
    if (gaDay != null && gaDay > 0) return `${gaWeeks}⁺${gaDay}`;
    return String(gaWeeks);
  })();

  const hasAdmitVitals =
    bpSystolicAdmit != null || bpDiastolicAdmit != null || pulseAdmit != null ||
    rrAdmit != null || temperatureAdmit != null;
  const hasAdmitCervix =
    cervicalOpenCmAdmit != null || effacementPctAdmit != null ||
    (stationAdmit != null && stationAdmit !== '');

  const dash = <span className="text-[var(--ink-navy-muted)]">—</span>;
  const weightSev = sevWeightGain(effectiveWeightDiff);
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
          label={pregNo != null ? `ครรภ์ที่ ${pregNo}` : 'G_P_A_L'}
          labelEn="OB FORMULA"
          value={gpalText ?? dash}
        />
        <Tile
          icon={<Calendar className="h-3 w-3" />}
          label="อายุครรภ์"
          labelEn="GA"
          value={gaText ?? dash}
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
            {hasFullWeight && preWeight !== null && effectiveWeightDiff != null ? (
              <>
                <span>{preWeight}</span>
                <span className="mx-0.5 text-[var(--ink-navy-muted)]">→</span>
                <span className="font-semibold text-[var(--ink-navy)]">{weightKg}</span>
                <span className="mx-0.5 text-[var(--ink-navy-muted)]">=</span>
                <span className="font-bold" style={{ color: weightColor }}>
                  {effectiveWeightDiff >= 0 ? '+' : ''}{effectiveWeightDiff}
                </span>
                <span className="ml-0.5 text-[10px] text-[var(--ink-navy-muted)]">กก.</span>
              </>
            ) : effectiveWeightDiff != null ? (
              <>
                <span className="font-bold" style={{ color: weightColor }}>
                  {effectiveWeightDiff >= 0 ? '+' : ''}{effectiveWeightDiff}
                </span>
                <span className="ml-0.5 text-[10px] text-[var(--ink-navy-muted)]">กก.</span>
              </>
            ) : (
              dash
            )}
          </div>
          <div className="font-mono text-[10px] text-[var(--ink-navy-dim)]">
            ส่วนต่างน้ำหนัก
            {effectiveWeightDiff != null && effectiveWeightDiff > 20 && (
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

      {/* Admission snapshot — vitals & cervical exam taken at the moment of
          ipt admission. Distinct from partograph (which is the time-series).
          Hidden when no admission data was sent so the panel doesn't show
          a row of empty tiles. */}
      {(hasAdmitVitals || hasAdmitCervix) && (
        <>
          <div
            className="border-t px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-navy-dim)]"
            style={{
              borderColor: 'var(--rule-strong)',
              background: 'color-mix(in srgb, var(--accent-navy) 4%, white)',
            }}
          >
            แรกรับ · ADMISSION SNAPSHOT
          </div>
          <div className="grid grid-cols-2 gap-2 p-2 md:grid-cols-4">
            {hasAdmitVitals && (
              <Tile
                icon={<HeartPulse className="h-3 w-3" />}
                label="ความดันโลหิต"
                labelEn="BP ADMIT"
                value={
                  bpSystolicAdmit != null && bpDiastolicAdmit != null
                    ? `${bpSystolicAdmit}/${bpDiastolicAdmit}`
                    : bpSystolicAdmit != null
                      ? `${bpSystolicAdmit}/—`
                      : bpDiastolicAdmit != null
                        ? `—/${bpDiastolicAdmit}`
                        : dash
                }
                unit="mmHg"
                severity={sevAdmitBp(bpSystolicAdmit, bpDiastolicAdmit)}
                note={
                  (bpSystolicAdmit ?? 0) >= 160 || (bpDiastolicAdmit ?? 0) >= 110
                    ? 'Severe HT'
                    : (bpSystolicAdmit ?? 0) >= 140 || (bpDiastolicAdmit ?? 0) >= 90
                      ? 'Gestational HT'
                      : undefined
                }
              />
            )}
            {hasAdmitVitals && (
              <Tile
                icon={<Activity className="h-3 w-3" />}
                label="ชีพจร"
                labelEn="PULSE ADMIT"
                value={pulseAdmit != null ? pulseAdmit : dash}
                unit="bpm"
                severity={sevAdmitPulse(pulseAdmit)}
              />
            )}
            {hasAdmitVitals && (
              <Tile
                icon={<Thermometer className="h-3 w-3" />}
                label="อุณหภูมิ"
                labelEn="TEMP ADMIT"
                value={temperatureAdmit != null ? temperatureAdmit.toFixed(1) : dash}
                unit="°C"
                severity={sevAdmitTemp(temperatureAdmit)}
                note={
                  temperatureAdmit == null
                    ? undefined
                    : temperatureAdmit >= 38.5
                      ? 'Fever'
                      : temperatureAdmit < 35.5
                        ? 'Hypothermia'
                        : undefined
                }
              />
            )}
            {hasAdmitVitals && (
              <Tile
                icon={<Wind className="h-3 w-3" />}
                label="อัตราการหายใจ"
                labelEn="RR ADMIT"
                value={rrAdmit != null ? rrAdmit : dash}
                unit="/min"
              />
            )}
            {hasAdmitCervix && (
              <Tile
                icon={<Stethoscope className="h-3 w-3" />}
                label="ปากมดลูกแรกรับ"
                labelEn="CERVIX ADMIT"
                value={cervicalOpenCmAdmit != null ? cervicalOpenCmAdmit : dash}
                unit="ซม."
                severity={sevAdmitCervix(cervicalOpenCmAdmit)}
                note={
                  cervicalOpenCmAdmit == null
                    ? undefined
                    : cervicalOpenCmAdmit >= 8
                      ? 'Late presentation'
                      : cervicalOpenCmAdmit >= 4
                        ? 'Active phase'
                        : 'Latent'
                }
              />
            )}
            {hasAdmitCervix && (
              <Tile
                icon={<Stethoscope className="h-3 w-3" />}
                label="Effacement"
                labelEn="EFF. ADMIT"
                value={effacementPctAdmit != null ? effacementPctAdmit : dash}
                unit="%"
              />
            )}
            {hasAdmitCervix && (
              <Tile
                icon={<Stethoscope className="h-3 w-3" />}
                label="Station"
                labelEn="STATION ADMIT"
                value={stationAdmit != null && stationAdmit !== '' ? stationAdmit : dash}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
