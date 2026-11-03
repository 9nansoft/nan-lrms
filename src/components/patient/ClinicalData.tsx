// ClinicalData — grid of clinical measurements. Each metric has a clinical
// normal band; abnormal / borderline values get tinted backgrounds (STATUS_TONE
// token classes) + Thai status badges so the clinician's eye lands on the
// clinically-actionable numbers first. Severity thresholds are unchanged.
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
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import { GA_TERM_LABEL_TH, classifyGaTerm } from '@/config/obstetric-display';
import { cn } from '@/lib/utils';

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

const SEV_TONE: Record<Severity, StatusTone | null> = {
  abnormal: 'danger',
  borderline: 'warn',
  normal: 'ok',
  neutral: null,
};

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
  value,
  unit,
  severity = 'neutral',
  note,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  unit?: string;
  severity?: Severity;
  note?: string;
}) {
  const tone = SEV_TONE[severity];
  const t = tone ? STATUS_TONE[tone] : null;
  const showBadge = severity === 'abnormal' || severity === 'borderline';
  return (
    <div
      className={cn(
        'relative flex flex-col gap-0.5 rounded-xl border border-border border-l-4 px-2.5 py-2',
        t ? cn(t.accent, t.tint) : 'border-l-brand bg-surface-card',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <div className="inline-flex items-center gap-1.5 text-label text-ink-muted">
          <span aria-hidden="true" className="flex h-3.5 w-3.5 items-center justify-center">
            {icon}
          </span>
          {label}
        </div>
        {showBadge && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-caption font-semibold',
              severity === 'abnormal'
                ? 'bg-danger text-white'
                : 'border border-warn/40 bg-surface-card text-warn-text',
            )}
          >
            <AlertTriangle aria-hidden="true" className="h-3 w-3" />
            {severity === 'abnormal' ? 'ผิดปกติ' : 'เฝ้าระวัง'}
          </span>
        )}
        {severity === 'normal' && <CheckCircle2 aria-hidden="true" className={cn('h-3.5 w-3.5', t?.text)} />}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('text-title tabular-nums', t ? t.text : 'text-ink')}>{value}</span>
        {unit && <span className="text-caption text-ink-muted">{unit}</span>}
      </div>
      {note && <div className="text-caption text-ink-muted">{note}</div>}
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

  const dash = <span className="text-ink-muted">—</span>;
  const gaTerm = classifyGaTerm(gaWeeks);
  const weightSev = sevWeightGain(effectiveWeightDiff);
  const weightTone = SEV_TONE[weightSev];
  const wt = weightTone ? STATUS_TONE[weightTone] : null;
  const weightShowBadge = weightSev === 'abnormal' || weightSev === 'borderline';

  return (
    <div className="rounded-2xl border border-border bg-surface-card">
      <div className="flex items-center gap-2 border-b border-border bg-brand-soft/40 px-3 py-2">
        <Activity aria-hidden="true" className="h-4 w-4 text-brand" />
        <h3 className="text-body-lg text-ink">ข้อมูลทางคลินิก</h3>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 p-2">
        <Tile
          icon={<Activity className="h-3 w-3" />}
          label={pregNo != null ? `ครรภ์ที่ ${pregNo}` : 'ครรภ์ G_P_A_L'}
          value={gpalText ?? dash}
        />
        <Tile
          icon={<Calendar className="h-3 w-3" />}
          label="อายุครรภ์"
          value={gaText ?? dash}
          unit="สัปดาห์"
          severity={sevGa(gaWeeks)}
          note={gaTerm ? GA_TERM_LABEL_TH[gaTerm] : undefined}
        />
        <Tile
          icon={<Baby className="h-3 w-3" />}
          label="ฝากครรภ์"
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
          className={cn(
            'relative flex flex-col gap-0.5 rounded-xl border border-border border-l-4 px-2.5 py-2',
            wt ? cn(wt.accent, wt.tint) : 'border-l-brand bg-surface-card',
          )}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="inline-flex items-center gap-1.5 text-label text-ink-muted">
              <Scale aria-hidden="true" className="h-3.5 w-3.5" />
              น้ำหนักที่เพิ่ม
            </div>
            {weightShowBadge && weightDiffKg != null && (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-caption font-semibold',
                  weightSev === 'abnormal'
                    ? 'bg-danger text-white'
                    : 'border border-warn/40 bg-surface-card text-warn-text',
                )}
              >
                <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                {weightSev === 'abnormal' ? 'ผิดปกติ' : 'เฝ้าระวัง'}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-body tabular-nums text-ink-muted">
            {hasFullWeight && preWeight !== null && effectiveWeightDiff != null ? (
              <>
                <span>{preWeight}</span>
                <span className="mx-0.5 text-ink-muted">→</span>
                <span className="font-semibold text-ink">{weightKg}</span>
                <span className="mx-0.5 text-ink-muted">=</span>
                <span className={cn('font-bold', wt?.text)}>
                  {effectiveWeightDiff >= 0 ? '+' : ''}{effectiveWeightDiff}
                </span>
                <span className="ml-0.5 text-caption text-ink-muted">กก.</span>
              </>
            ) : effectiveWeightDiff != null ? (
              <>
                <span className={cn('font-bold', wt?.text)}>
                  {effectiveWeightDiff >= 0 ? '+' : ''}{effectiveWeightDiff}
                </span>
                <span className="ml-0.5 text-caption text-ink-muted">กก.</span>
              </>
            ) : (
              dash
            )}
          </div>
          <div className="text-caption text-ink-muted">
            ส่วนต่างน้ำหนัก
            {effectiveWeightDiff != null && effectiveWeightDiff > 20 && <span className="ml-1">· เกินเกณฑ์</span>}
          </div>
        </div>

        <Tile
          icon={<Ruler className="h-3 w-3" />}
          label="ยอดมดลูก"
          value={fundalHeightCm != null ? fundalHeightCm : dash}
          unit="ซม."
          severity={sevFundal(fundalHeightCm)}
        />
        <Tile
          icon={<Baby className="h-3 w-3" />}
          label="น้ำหนักเด็ก U/S"
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
          label="ฮีมาโตคริต (Hct)"
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
          <div className="border-t border-border bg-brand-soft/40 px-3 py-1.5 text-label text-ink">
            ค่าแรกรับ
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2 p-2">
            {hasAdmitVitals && (
              <Tile
                icon={<HeartPulse className="h-3 w-3" />}
                label="ความดันโลหิต"
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
                value={pulseAdmit != null ? pulseAdmit : dash}
                unit="bpm"
                severity={sevAdmitPulse(pulseAdmit)}
              />
            )}
            {hasAdmitVitals && (
              <Tile
                icon={<Thermometer className="h-3 w-3" />}
                label="อุณหภูมิ"
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
                value={rrAdmit != null ? rrAdmit : dash}
                unit="/min"
              />
            )}
            {hasAdmitCervix && (
              <Tile
                icon={<Stethoscope className="h-3 w-3" />}
                label="ปากมดลูกแรกรับ"
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
                value={effacementPctAdmit != null ? effacementPctAdmit : dash}
                unit="%"
              />
            )}
            {hasAdmitCervix && (
              <Tile
                icon={<Stethoscope className="h-3 w-3" />}
                label="Station"
                value={stationAdmit != null && stationAdmit !== '' ? stationAdmit : dash}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
