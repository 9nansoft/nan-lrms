// Journey detail page — full pregnancy journey for one woman.
// Redesigned 2026-04-21 in the dashboard's air-traffic-control aesthetic.
'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionLabel } from '@/components/dashboard/shared';
import { cn, formatRelativeTime } from '@/lib/utils';
import {
  ArrowLeft,
  Baby,
  Calendar,
  Hospital,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Droplets,
  Heart,
  Activity,
  Ruler,
} from 'lucide-react';

// ─── Types (shape must match /api/journeys/[journeyId]) ───────────────────

interface AncVisit {
  visitDate: string;
  visitNumber: number;
  gaWeeks: number | null;
  fundalHeightCm: number | null;
  weightKg: number | null;
  bpSystolic: number | null;
  bpDiastolic: number | null;
  fetalHr: number | null;
  presentation: string | null;
  engagement: string | null;
  passQuality: boolean | null;
  urineProtein: string | null;
  urineGlucose: string | null;
  hbGDl: number | null;
  hctPct: number | null;
  ttDoseNo: number | null;
  ironFolicGiven: boolean | null;
  calciumGiven: boolean | null;
  dangerSigns: string[] | null;
  fetalMovementOk: boolean | null;
}

interface LatestRisk {
  riskLevel: string;
  triggeredRules: string[];
  screenedAt: string;
  recommendedFacility: string | null;
}

interface Referral {
  id: string;
  fromHospital: string;
  toHospital: string;
  status: string;
  reason: string | null;
  urgencyLevel: string | null;
  initiatedAt: string;
  arrivedAt: string | null;
}

interface Newborn {
  infantNumber: number;
  sex: string | null;
  birthWeightG: number | null;
  apgar1min: number | null;
  apgar5min: number | null;
  bornAt: string | null;
}

interface Journey {
  id: string;
  hn: string;
  name: string;
  age: number;
  gravida: number | null;
  para: number | null;
  gaWeeks: number | null;
  lmp: string | null;
  edc: string | null;
  careStage: string;
  ancRiskLevel: string | null;
  ancVisitCount: number;
  lastAncDate: string | null;
  hospitalName: string;
  hcode: string;
  registeredAt: string;
  currentHospitalName: string | null;
  currentHcode: string | null;
  heightCm: number | null;
  bloodGroup: string | null;
  rhFactor: string | null;
  hbsagResult: string | null;
  vdrlResult: string | null;
  hivResult: string | null;
  ogttResult: string | null;
  termBirths: number | null;
  pretermBirths: number | null;
  abortions: number | null;
  livingChildren: number | null;
  pastMedicalHistory: string | null;
}

interface JourneyDetailResponse {
  journey: Journey;
  ancVisits: AncVisit[];
  latestRisk: LatestRisk | null;
  referrals: Referral[];
  newborns: Newborn[];
}

// ─── Labels + thresholds ──────────────────────────────────────────────────

const ANC_RISK_COLOR: Record<string, string> = {
  LOW: 'var(--risk-low)',
  HR1: 'var(--risk-medium)',
  HR2: 'var(--risk-medium)',
  HR3: 'var(--risk-high)',
};
const ANC_RISK_LABEL_TH: Record<string, string> = {
  LOW: 'ความเสี่ยงต่ำ',
  HR1: 'ความเสี่ยง ระดับ 1',
  HR2: 'ความเสี่ยง ระดับ 2',
  HR3: 'ความเสี่ยงสูง',
};
const STAGE_LABEL_TH: Record<string, string> = {
  PREGNANCY: 'ฝากครรภ์',
  LABOR: 'ระหว่างคลอด',
  DELIVERED: 'คลอดแล้ว',
  POSTPARTUM: 'หลังคลอด',
};
const STAGE_COLOR: Record<string, string> = {
  PREGNANCY: 'var(--accent-navy)',
  LABOR: 'var(--risk-medium)',
  DELIVERED: 'var(--risk-low)',
  POSTPARTUM: 'var(--ink-navy-muted)',
};
const REFERRAL_STATUS_LABEL: Record<string, string> = {
  INITIATED: 'รอรับเคส',
  ACCEPTED: 'รับแล้ว',
  IN_TRANSIT: 'กำลังเดินทาง',
  ARRIVED: 'ถึงปลายทาง',
  REJECTED: 'ปฏิเสธ',
  PENDING: 'รอดำเนินการ',
  CANCELLED: 'ยกเลิก',
};
const SEX_LABEL_TH: Record<string, string> = { M: 'ชาย', F: 'หญิง' };

// Clinical normal bands (rough — used only for visual hint, not actual CDSS).
const BP_SYS_HIGH = 140;
const BP_DIA_HIGH = 90;
const FHR_LOW = 110;
const FHR_HIGH = 160;

// WHO 2016 recommended 8-contact ANC schedule — target gestational weeks.
// First contact < 12w; then 20/26/30/34/36/38/40. See NBK409109.
const WHO_CONTACT_WEEKS = [12, 20, 26, 30, 34, 36, 38, 40];
const WHO_CONTACT_WINDOW_W = 1; // ±1w counts as "attended".

// Short labels for baby_position / baby_lead. HOSxP values are inconsistent
// across sites, so we recognize common codes and fall back to the raw value.
function presentationLabel(code: string | null): string {
  if (!code) return '—';
  const c = code.trim().toUpperCase();
  if (/V|C|CEPH|HEAD|ศีรษะ/.test(c)) return 'CEPHALIC';
  if (/BR|B|BREECH|ก้น/.test(c)) return 'BREECH';
  if (/TR|OBL|T|ขวาง/.test(c)) return 'TRANSVERSE';
  return code.slice(0, 10);
}
function engagementLabel(code: string | null): string {
  if (!code) return '—';
  const c = code.trim().toUpperCase();
  if (/ENG|E|เข้า|FIXED/.test(c)) return 'ENGAGED';
  if (/F|FL|ลอย|BALLOTABLE/.test(c)) return 'FLOATING';
  return code.slice(0, 10);
}

// Lab-flag extraction — map triggered ANC-risk rule IDs to icons & labels.
// These rule IDs come from src/config/anc-risk-rules.ts.
interface LabFlag {
  key: string;
  label: string;
  color: string;
}
const LAB_FLAGS_FROM_RULES: Record<string, LabFlag> = {
  hr2_rh_negative:  { key: 'rh',   label: 'Rh−',         color: 'var(--risk-medium)' },
  hr2_hbsag:        { key: 'hbsag',label: 'HBsAg+',      color: 'var(--risk-medium)' },
  hr2_syphilis:     { key: 'vdrl', label: 'SYPHILIS+',   color: 'var(--risk-high)'   },
  hr2_hiv:          { key: 'hiv',  label: 'HIV+',        color: 'var(--risk-high)'   },
  hr2_thalassemia:  { key: 'thal', label: 'THAL DISEASE',color: 'var(--risk-medium)' },
  hr3_nipt:         { key: 'nipt', label: 'NIPT HIGH',   color: 'var(--risk-high)'   },
  hr3_anemia:       { key: 'anem', label: 'SEVERE ANEMIA', color: 'var(--risk-high)' },
};

function formatThai(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
function formatThaiDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return (
    d.toLocaleDateString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }) +
    ' ' +
    d.toLocaleTimeString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  );
}

// Days between two ISO timestamps (floor).
function daysBetween(fromIso: string, toIso: string): number {
  return Math.floor((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 86400_000);
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// ─── Small pieces ─────────────────────────────────────────────────────────

function Pill({
  label,
  color,
  bg,
  borderColor,
}: {
  label: string;
  color: string;
  bg?: string;
  borderColor?: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em]"
      style={{
        color,
        borderColor: borderColor ?? color,
        background: bg ?? 'transparent',
      }}
    >
      {label}
    </span>
  );
}

function VisitChip({
  label,
  color,
  icon,
}: {
  label: string;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.04em]"
      style={{ color, borderColor: color }}
    >
      {icon}
      {label}
    </span>
  );
}

function LabResult({
  label,
  value,
  abnormalIf,
  positiveIsBad = false,
}: {
  label: string;
  value: string | null;
  abnormalIf?: (v: string) => boolean;
  positiveIsBad?: boolean;
}) {
  const v = value ?? null;
  const abn = v ? (abnormalIf ? abnormalIf(v) : false) : false;
  void positiveIsBad;
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
      <span className="text-[var(--ink-navy-muted)]">{label}</span>
      <span
        className="font-semibold tabular-nums"
        style={{
          color: v == null
            ? 'var(--ink-navy-muted)'
            : abn
              ? 'var(--risk-high)'
              : 'var(--ink-navy)',
        }}
      >
        {v ?? '—'}
      </span>
    </span>
  );
}

const DANGER_LABEL_TH: Record<string, string> = {
  severe_headache: 'ปวดศีรษะรุนแรง',
  blurred_vision: 'ตาพร่ามัว',
  epigastric_pain: 'ปวดลิ้นปี่',
  vaginal_bleeding: 'เลือดออกทางช่องคลอด',
  reduced_fm: 'ลูกดิ้นน้อยลง',
  fever: 'ไข้',
  rom: 'น้ำเดิน',
  convulsion: 'ชัก',
};
function dangerLabel(code: string): string {
  return DANGER_LABEL_TH[code] ?? code;
}

function MetricTile({
  label,
  value,
  sub,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-0.5 px-4 py-3"
      style={{ borderLeft: `2px solid ${color ?? 'var(--accent-navy)'}` }}
    >
      <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
        {icon}
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <div
          className="font-mono text-[20px] font-semibold leading-none tabular-nums"
          style={{ color: 'var(--ink-navy)', letterSpacing: '-0.01em' }}
        >
          {value}
        </div>
        {sub && (
          <div className="font-mono text-[10px] text-[var(--ink-navy-muted)]">{sub}</div>
        )}
      </div>
    </div>
  );
}

/** GA progress bar with WHO 8-contact schedule overlay. */
function GaProgressBar({
  gaWeeks,
  attendedWeeks,
}: {
  gaWeeks: number | null;
  /** Integer GA weeks at which a visit was recorded — used to light the target dots. */
  attendedWeeks: number[];
}) {
  const ga = gaWeeks ?? 0;
  const pct = Math.min(100, Math.max(0, (ga / 40) * 100));
  const color =
    ga >= 41
      ? 'var(--risk-high)'
      : ga >= 37
        ? 'var(--risk-low)'
        : ga >= 28
          ? 'var(--accent-navy)'
          : ga > 0
            ? 'var(--risk-medium)'
            : 'var(--ink-navy-muted)';
  const trimester =
    ga < 14 ? 'T1' : ga < 28 ? 'T2' : ga < 37 ? 'T3' : ga < 41 ? 'TERM' : 'POST-TERM';
  const attendedSet = new Set(attendedWeeks);
  const attendedCount = WHO_CONTACT_WEEKS.filter((w) =>
    attendedWeeks.some((v) => Math.abs(v - w) <= WHO_CONTACT_WINDOW_W),
  ).length;
  return (
    <div>
      <div className="flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
        <span>WHO 8-CONTACT SCHEDULE · GA PROGRESS</span>
        <span>
          {gaWeeks != null ? (
            <>
              {gaWeeks}
              <span className="text-[9px]">w</span> · {trimester}
            </>
          ) : (
            '—'
          )}
          <span className="ml-3">
            ATTENDED{' '}
            <span
              className="font-semibold tabular-nums"
              style={{
                color: attendedCount >= 6 ? 'var(--risk-low)'
                  : attendedCount >= 3 ? 'var(--accent-navy)'
                  : 'var(--risk-medium)',
              }}
            >
              {attendedCount}
            </span>
            /8
          </span>
        </span>
      </div>
      <div
        className="relative mt-2 h-2 w-full overflow-visible"
        style={{ background: 'var(--surface-sunken)' }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: color }} />
        {/* WHO 8-contact target dots */}
        {WHO_CONTACT_WEEKS.map((week, i) => {
          const hit = attendedWeeks.some((v) => Math.abs(v - week) <= WHO_CONTACT_WINDOW_W);
          const passed = ga >= week;
          // Missed = target week already passed without a matching visit.
          const missed = passed && !hit;
          const fill = hit
            ? 'var(--risk-low)'
            : missed
              ? 'var(--risk-high)'
              : '#ffffff';
          const border = hit
            ? 'var(--risk-low)'
            : missed
              ? 'var(--risk-high)'
              : 'var(--rule-strong)';
          return (
            <span
              key={week}
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                left: `${(week / 40) * 100}%`,
                top: '50%',
                width: 10,
                height: 10,
                background: fill,
                borderColor: border,
                borderWidth: 1.5,
              }}
              title={`Contact ${i + 1} · ${week}w${hit ? ' · attended' : missed ? ' · missed' : ''}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[9px] text-[var(--ink-navy-muted)]">
        {WHO_CONTACT_WEEKS.map((week, i) => (
          <span
            key={week}
            className="tabular-nums"
            style={{
              color: attendedSet.has(week) ? 'var(--risk-low)' : undefined,
            }}
          >
            C{i + 1}·{week}w
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function JourneyDetailPage({
  params,
}: {
  params: Promise<{ journeyId: string }>;
}) {
  const { journeyId } = use(params);
  const router = useRouter();

  const { data, isLoading } = useSWR<JourneyDetailResponse>(
    `/api/journeys/${journeyId}`,
    fetcher,
    { refreshInterval: 60000 },
  );

  const journeyName = data?.journey?.name ?? 'Journey';
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'ฝากครรภ์', href: '/pregnancies' },
    { label: journeyName },
  ]);

  // React Compiler memoizes this automatically — no manual useMemo needed.
  const derived = (() => {
    if (!data?.journey) return null;
    const j = data.journey;
    const nowIso = new Date().toISOString();
    const daysSinceRegistered = daysBetween(j.registeredAt, nowIso);
    const daysSinceLastAnc = j.lastAncDate ? daysBetween(j.lastAncDate, nowIso) : null;
    const daysToEdc = j.edc ? daysBetween(nowIso, j.edc) : null;

    // Attended GA weeks (unique, integer) — used by WHO 8-contact tracker.
    const attendedWeeks = Array.from(
      new Set(
        (data.ancVisits ?? [])
          .map((v) => (v.gaWeeks != null ? Math.round(v.gaWeeks) : null))
          .filter((w): w is number => w != null),
      ),
    ).sort((a, b) => a - b);

    // First-contact GA — WHO expects < 12w; flag late registrations.
    const firstVisitGa = (data.ancVisits ?? [])
      .filter((v) => v.gaWeeks != null)
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())[0]?.gaWeeks ?? null;
    const lateFirstContact = firstVisitGa != null && firstVisitGa > 12;

    // Pre-pregnancy BMI — only when we have both height (labor record) and the
    // earliest visit weight. Clinical BMI = kg / (m*m).
    let bmi: number | null = null;
    const heightCm = j.heightCm;
    const firstWeight = (data.ancVisits ?? [])
      .filter((v) => v.weightKg != null)
      .sort((a, b) => new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime())[0]?.weightKg ?? null;
    if (heightCm && heightCm > 100 && firstWeight && firstWeight > 0) {
      const m = heightCm / 100;
      bmi = Math.round((firstWeight / (m * m)) * 10) / 10;
    }

    // Lab flags present in the latest risk screen.
    const ruleIds = data.latestRisk?.triggeredRules ?? [];
    const labFlags: LabFlag[] = ruleIds
      .map((id) => LAB_FLAGS_FROM_RULES[id])
      .filter((f): f is LabFlag => !!f);

    return {
      daysSinceRegistered,
      daysSinceLastAnc,
      daysToEdc,
      attendedWeeks,
      firstVisitGa,
      lateFirstContact,
      bmi,
      heightCm,
      labFlags,
    };
  })();

  if (isLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลการฝากครรภ์..." />;
  }

  if (!data?.journey) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 py-24 px-6"
        style={{ background: 'var(--surface-cool)', minHeight: '100%' }}
      >
        <Baby className="h-10 w-10 text-[var(--ink-navy-muted)] opacity-50" />
        <p className="font-mono text-[12px] text-[var(--ink-navy-muted)]">
          ไม่พบข้อมูลการฝากครรภ์
        </p>
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-sm border bg-white px-3 py-1.5 font-mono text-[11px] text-[var(--ink-navy-dim)] hover:bg-[var(--accent-navy-soft)]"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <ArrowLeft className="h-3.5 w-3.5" /> กลับ
        </button>
      </div>
    );
  }

  const { journey, ancVisits, latestRisk, referrals, newborns } = data;
  const riskColor =
    ANC_RISK_COLOR[journey.ancRiskLevel ?? ''] ?? 'var(--ink-navy-muted)';
  const riskLabel = journey.ancRiskLevel
    ? (ANC_RISK_LABEL_TH[journey.ancRiskLevel] ?? journey.ancRiskLevel)
    : null;
  const stageColor = STAGE_COLOR[journey.careStage] ?? 'var(--ink-navy-muted)';
  const stageLabel = STAGE_LABEL_TH[journey.careStage] ?? journey.careStage;
  const isReferred = !!journey.currentHcode && journey.currentHcode !== journey.hcode;

  return (
    <div
      className="flex flex-col gap-4 px-6 py-6 lg:px-8"
      style={{
        color: 'var(--ink-navy)',
        background: 'var(--surface-cool)',
        zoom: 1.15,
        minHeight: '100%',
      }}
    >
      {/* Back + header */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.1em] text-[var(--ink-navy-muted)] hover:text-[var(--accent-navy)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> BACK
        </button>
        <div className="flex items-center gap-2">
          {journey.ancRiskLevel && (
            <Pill
              label={journey.ancRiskLevel}
              color={riskColor}
              bg="transparent"
            />
          )}
          <Pill label={stageLabel.toUpperCase()} color={stageColor} />
        </div>
      </div>

      {/* Eyebrow + title */}
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-navy-muted)]">
          PROVINCIAL REGISTRY · JOURNEY DETAIL
        </div>
        <h1
          className="mt-1 text-[28px] font-bold leading-tight"
          style={{ color: 'var(--ink-navy)', letterSpacing: '-0.01em' }}
        >
          {journey.name}
        </h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[12px] text-[var(--ink-navy-dim)]">
          <span>
            HN <span className="font-semibold text-[var(--ink-navy)]">{journey.hn}</span>
          </span>
          <span>
            อายุ{' '}
            <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
              {journey.age}
            </span>{' '}
            ปี
          </span>
          {journey.gravida != null && (
            <span className="font-mono tracking-[0.05em]">
              G<span className="font-semibold text-[var(--ink-navy)]">{journey.gravida}</span>
              {journey.termBirths != null && (
                <>·T<span className="font-semibold text-[var(--ink-navy)]">{journey.termBirths}</span></>
              )}
              {journey.pretermBirths != null && (
                <>·P<span className="font-semibold text-[var(--ink-navy)]">{journey.pretermBirths}</span></>
              )}
              {journey.abortions != null && (
                <>·A<span className="font-semibold text-[var(--ink-navy)]">{journey.abortions}</span></>
              )}
              {journey.livingChildren != null && (
                <>·L<span className="font-semibold text-[var(--ink-navy)]">{journey.livingChildren}</span></>
              )}
              {journey.termBirths == null && journey.pretermBirths == null && (
                <>·P<span className="font-semibold text-[var(--ink-navy)]">{journey.para ?? '?'}</span></>
              )}
            </span>
          )}
          <span>
            STAGE {stageLabel}
          </span>
        </div>
      </div>

      {/* 01 — Pregnancy summary */}
      <section>
        <SectionLabel
          idx={1}
          right={
            <span>
              REGISTERED {formatThai(journey.registeredAt)}
              {derived?.daysSinceRegistered != null && (
                <> · {derived.daysSinceRegistered}d AGO</>
              )}
            </span>
          }
        >
          Pregnancy summary
        </SectionLabel>
        <div
          className="mt-2 grid border bg-white"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            borderColor: 'var(--rule-strong)',
          }}
        >
          <MetricTile
            label="LMP"
            value={formatThai(journey.lmp)}
            sub="วันแรกประจำเดือน"
            color="var(--accent-navy)"
            icon={<Calendar className="h-3 w-3" />}
          />
          <MetricTile
            label="EDC"
            value={formatThai(journey.edc)}
            sub={
              derived?.daysToEdc != null
                ? derived.daysToEdc > 0
                  ? `อีก ${derived.daysToEdc} วัน`
                  : `เลย ${Math.abs(derived.daysToEdc)} วัน`
                : 'วันกำหนดคลอด'
            }
            color={
              derived?.daysToEdc != null && derived.daysToEdc < 0
                ? 'var(--risk-high)'
                : 'var(--risk-low)'
            }
            icon={<Calendar className="h-3 w-3" />}
          />
          <MetricTile
            label="GA"
            value={journey.gaWeeks != null ? `${journey.gaWeeks}w` : '—'}
            sub={
              journey.gaWeeks != null
                ? journey.gaWeeks >= 37
                  ? 'Term'
                  : journey.gaWeeks >= 28
                    ? 'Third trimester'
                    : journey.gaWeeks >= 14
                      ? 'Second trimester'
                      : 'First trimester'
                : undefined
            }
            color={
              journey.gaWeeks != null && journey.gaWeeks >= 41
                ? 'var(--risk-high)'
                : 'var(--accent-navy)'
            }
            icon={<Clock className="h-3 w-3" />}
          />
          <MetricTile
            label="ANC VISITS"
            value={journey.ancVisitCount}
            sub={
              derived?.daysSinceLastAnc != null
                ? `ครั้งล่าสุด ${derived.daysSinceLastAnc}d ago`
                : 'ยังไม่มีนัด'
            }
            color={
              derived?.daysSinceLastAnc != null && derived.daysSinceLastAnc > 28
                ? 'var(--risk-high)'
                : 'var(--accent-navy)'
            }
            icon={<Activity className="h-3 w-3" />}
          />
        </div>

        {/* GA progress + WHO 8-contact dots */}
        <div
          className="border border-t-0 bg-white px-4 py-3"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <GaProgressBar
            gaWeeks={journey.gaWeeks}
            attendedWeeks={derived?.attendedWeeks ?? []}
          />
          {/* Derived clinical context row */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-mono text-[11px] text-[var(--ink-navy-dim)]">
            {derived?.heightCm != null && (
              <span>
                <span className="text-[var(--ink-navy-muted)]">HEIGHT </span>
                <span className="font-semibold tabular-nums text-[var(--ink-navy)]">
                  {derived.heightCm}
                </span>
                <span className="text-[10px] text-[var(--ink-navy-muted)]"> cm</span>
              </span>
            )}
            {derived?.bmi != null && (
              <span>
                <span className="text-[var(--ink-navy-muted)]">PRE-PREG BMI </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{
                    color:
                      derived.bmi < 18.5
                        ? 'var(--risk-medium)'
                        : derived.bmi >= 30
                          ? 'var(--risk-high)'
                          : derived.bmi >= 23
                            ? 'var(--risk-medium)'
                            : 'var(--risk-low)',
                  }}
                >
                  {derived.bmi}
                </span>
                <span className="ml-1 text-[10px] text-[var(--ink-navy-muted)]">
                  {derived.bmi < 18.5
                    ? 'UNDERWEIGHT'
                    : derived.bmi >= 40
                      ? 'MORBID OBESE'
                      : derived.bmi >= 30
                        ? 'OBESE'
                        : derived.bmi >= 23
                          ? 'OVERWEIGHT'
                          : 'NORMAL'}
                </span>
              </span>
            )}
            {derived?.firstVisitGa != null && (
              <span>
                <span className="text-[var(--ink-navy-muted)]">FIRST CONTACT </span>
                <span
                  className="font-semibold tabular-nums"
                  style={{
                    color: derived.lateFirstContact
                      ? 'var(--risk-high)'
                      : 'var(--risk-low)',
                  }}
                >
                  {derived.firstVisitGa}w
                </span>
                {derived.lateFirstContact && (
                  <span className="ml-1 text-[10px] font-semibold text-[var(--risk-high)]">
                    {'·LATE (WHO \u003C 12w)'}
                  </span>
                )}
              </span>
            )}
            {(derived?.labFlags.length ?? 0) > 0 && (
              <span className="flex flex-wrap items-center gap-1">
                <span className="text-[var(--ink-navy-muted)]">LAB</span>
                {derived!.labFlags.map((f) => (
                  <span
                    key={f.key}
                    className="inline-flex items-center border px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-[0.06em]"
                    style={{ color: f.color, borderColor: f.color }}
                  >
                    {f.label}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Labs & obstetric history (WHO 2016 — journey level) */}
        {(journey.bloodGroup || journey.rhFactor || journey.hbsagResult ||
          journey.vdrlResult || journey.hivResult || journey.ogttResult ||
          journey.pastMedicalHistory) && (
          <div
            className="grid gap-3 border border-t-0 bg-white px-4 py-3 text-[12px] sm:grid-cols-2"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
                LABS · ผลตรวจทางห้องปฏิบัติการ
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                <LabResult label="BLOOD" value={journey.bloodGroup} />
                <LabResult label="Rh" value={journey.rhFactor} positiveIsBad={false} abnormalIf={(v) => v === 'NEG'} />
                <LabResult label="HBsAg" value={journey.hbsagResult} positiveIsBad abnormalIf={(v) => v === 'POS'} />
                <LabResult label="VDRL" value={journey.vdrlResult} positiveIsBad abnormalIf={(v) => v === 'POS'} />
                <LabResult label="HIV" value={journey.hivResult} positiveIsBad abnormalIf={(v) => v === 'POS'} />
                <LabResult label="OGTT" value={journey.ogttResult} abnormalIf={(v) => v === 'ABNORMAL'} />
              </div>
            </div>
            {journey.pastMedicalHistory && (
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
                  PMH · โรคประจำตัว
                </div>
                <div className="mt-1.5 text-[13px] text-[var(--ink-navy-dim)]">
                  {journey.pastMedicalHistory}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hospital row */}
        <div
          className="flex flex-wrap items-center gap-4 border border-t-0 bg-white px-4 py-3 text-[12px]"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div className="flex items-center gap-1.5">
            <Hospital className="h-3.5 w-3.5 text-[var(--ink-navy-muted)]" />
            <span className="text-[var(--ink-navy-muted)]">REGISTERED AT</span>
            <Link
              href={`/hospitals/${journey.hcode}`}
              className="font-semibold text-[var(--ink-navy)] hover:text-[var(--accent-navy)] hover:underline"
            >
              {journey.hospitalName}
            </Link>
          </div>
          {isReferred && journey.currentHospitalName && (
            <div className="flex items-center gap-1.5">
              <ArrowRightLeft className="h-3.5 w-3.5 text-[var(--risk-medium)]" />
              <span className="text-[var(--ink-navy-muted)]">CURRENT</span>
              <Link
                href={`/hospitals/${journey.currentHcode}`}
                className="font-semibold text-[var(--risk-medium)] hover:underline"
              >
                {journey.currentHospitalName}
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 02 — ANC timeline */}
      <section>
        <SectionLabel
          idx={2}
          right={
            <span>
              {ancVisits.length} VISIT{ancVisits.length === 1 ? '' : 'S'}
            </span>
          }
        >
          ANC visit timeline
        </SectionLabel>
        <div
          className="mt-2 border bg-white overflow-x-auto"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          {ancVisits.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Calendar className="mx-auto mb-2 h-6 w-6 text-[var(--ink-navy-muted)] opacity-50" />
              <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
                ยังไม่มีประวัติการฝากครรภ์
              </p>
            </div>
          ) : (
            <>
              <div
                className="grid gap-2 border-b px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
                style={{
                  gridTemplateColumns: '38px 108px 48px 64px 60px 84px 62px 86px 74px 1fr',
                  borderColor: 'var(--rule-strong)',
                  minWidth: 760,
                }}
              >
                <div>#</div>
                <div>DATE</div>
                <div>GA</div>
                <div>FH (cm)</div>
                <div>WT (kg)</div>
                <div>BP</div>
                <div>FHR</div>
                <div>PRES.</div>
                <div>LIE</div>
                <div>FLAGS</div>
              </div>
              {ancVisits.map((v) => {
                const bpHigh =
                  (v.bpSystolic != null && v.bpSystolic >= BP_SYS_HIGH) ||
                  (v.bpDiastolic != null && v.bpDiastolic >= BP_DIA_HIGH);
                const fhrAbnormal =
                  v.fetalHr != null && (v.fetalHr < FHR_LOW || v.fetalHr > FHR_HIGH);
                const proteinuria = v.urineProtein != null && /\+/.test(v.urineProtein);
                const glucosuria = v.urineGlucose != null && /\+/.test(v.urineGlucose);
                const anemia = v.hbGDl != null && v.hbGDl < 11;
                const severeAnemia = v.hbGDl != null && v.hbGDl < 9;
                const preeclampsiaSuspect = bpHigh && proteinuria;
                const reducedFm = v.fetalMovementOk === false;
                const dangers = v.dangerSigns ?? [];
                const anyFlag = bpHigh || fhrAbnormal || proteinuria || glucosuria ||
                  anemia || preeclampsiaSuspect || reducedFm || dangers.length > 0;
                return (
                  <div
                    key={v.visitNumber}
                    className="grid items-center gap-2 border-b px-3 text-[12px]"
                    style={{
                      gridTemplateColumns: '38px 108px 48px 64px 60px 84px 62px 86px 74px 1fr',
                      borderColor: 'var(--rule-hair)',
                      height: 40,
                      minWidth: 760,
                    }}
                  >
                    <div className="font-mono font-semibold tabular-nums text-[var(--ink-navy)]">
                      #{v.visitNumber}
                    </div>
                    <div>{formatThai(v.visitDate)}</div>
                    <div className="font-mono tabular-nums">
                      {v.gaWeeks ?? '—'}
                      {v.gaWeeks != null && (
                        <span className="text-[10px] text-[var(--ink-navy-muted)]">w</span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums">
                      {v.fundalHeightCm ?? '—'}
                    </div>
                    <div className="font-mono tabular-nums">
                      {v.weightKg ?? '—'}
                    </div>
                    <div
                      className={cn(
                        'font-mono tabular-nums',
                        bpHigh && 'font-semibold',
                      )}
                      style={{ color: bpHigh ? 'var(--risk-high)' : undefined }}
                    >
                      {v.bpSystolic != null && v.bpDiastolic != null
                        ? `${v.bpSystolic}/${v.bpDiastolic}`
                        : '—'}
                    </div>
                    <div
                      className={cn(
                        'font-mono tabular-nums',
                        fhrAbnormal && 'font-semibold',
                      )}
                      style={{ color: fhrAbnormal ? 'var(--risk-high)' : undefined }}
                    >
                      {v.fetalHr ?? '—'}
                    </div>
                    <div
                      className="font-mono text-[11px] tracking-[0.04em]"
                      style={{
                        color:
                          v.presentation && /BR|B|BREECH|ก้น|TR|T|OBL|ขวาง/i.test(v.presentation)
                            ? 'var(--risk-medium)'
                            : undefined,
                      }}
                    >
                      {presentationLabel(v.presentation)}
                    </div>
                    <div className="font-mono text-[11px] tracking-[0.04em] text-[var(--ink-navy-dim)]">
                      {engagementLabel(v.engagement)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {preeclampsiaSuspect && (
                        <VisitChip label="PRE-ECL SUSPECT" color="var(--risk-high)" />
                      )}
                      {bpHigh && !preeclampsiaSuspect && (
                        <VisitChip label="BP HIGH" color="var(--risk-high)" icon={<Droplets className="h-2.5 w-2.5" />} />
                      )}
                      {fhrAbnormal && (
                        <VisitChip label="FHR" color="var(--risk-high)" icon={<Heart className="h-2.5 w-2.5" />} />
                      )}
                      {severeAnemia && (
                        <VisitChip label={`Hb ${v.hbGDl}`} color="var(--risk-high)" />
                      )}
                      {anemia && !severeAnemia && (
                        <VisitChip label={`Hb ${v.hbGDl}`} color="var(--risk-medium)" />
                      )}
                      {proteinuria && (
                        <VisitChip label={`PROT ${v.urineProtein}`} color="var(--risk-high)" />
                      )}
                      {glucosuria && (
                        <VisitChip label={`GLUC ${v.urineGlucose}`} color="var(--risk-medium)" />
                      )}
                      {reducedFm && (
                        <VisitChip label="FM↓" color="var(--risk-high)" />
                      )}
                      {dangers.map((d) => (
                        <VisitChip key={d} label={dangerLabel(d)} color="var(--risk-high)" />
                      ))}
                      {v.ttDoseNo != null && v.ttDoseNo > 0 && (
                        <VisitChip label={`TT${v.ttDoseNo}`} color="var(--accent-navy)" />
                      )}
                      {v.ironFolicGiven && (
                        <VisitChip label="Fe+FA" color="var(--ink-navy-muted)" />
                      )}
                      {v.calciumGiven && (
                        <VisitChip label="Ca" color="var(--ink-navy-muted)" />
                      )}
                      {!anyFlag && (
                        <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[var(--risk-low)]">
                          <CheckCircle2 className="h-2.5 w-2.5" /> OK
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </section>

      {/* 03 — Risk assessment */}
      {latestRisk && (
        <section>
          <SectionLabel
            idx={3}
            right={<span>SCREENED {formatThai(latestRisk.screenedAt)}</span>}
          >
            Risk assessment
          </SectionLabel>
          <div
            className="mt-2 border bg-white"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            <div
              className="flex flex-wrap items-center gap-3 border-b px-4 py-3"
              style={{ borderColor: 'var(--rule-hair)' }}
            >
              <Pill
                label={latestRisk.riskLevel}
                color={ANC_RISK_COLOR[latestRisk.riskLevel] ?? 'var(--ink-navy-muted)'}
              />
              <span className="text-[13px] text-[var(--ink-navy-dim)]">
                {ANC_RISK_LABEL_TH[latestRisk.riskLevel] ?? latestRisk.riskLevel}
              </span>
              {latestRisk.recommendedFacility && (
                <span className="ml-auto font-mono text-[11px] text-[var(--ink-navy-muted)]">
                  แนะนำส่งต่อ ·{' '}
                  <span className="font-semibold text-[var(--ink-navy)]">
                    {latestRisk.recommendedFacility}
                  </span>
                </span>
              )}
            </div>
            {latestRisk.triggeredRules.length > 0 ? (
              <div className="px-4 py-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
                  ปัจจัยเสี่ยง · {latestRisk.triggeredRules.length} ข้อ
                </div>
                <ul className="mt-2 space-y-1.5">
                  {latestRisk.triggeredRules.map((rule) => (
                    <li
                      key={rule}
                      className="flex items-start gap-2 text-[13px]"
                      style={{ color: 'var(--ink-navy-dim)' }}
                    >
                      <AlertTriangle
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--risk-medium)' }}
                      />
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="px-4 py-3 font-mono text-[11px] text-[var(--ink-navy-muted)]">
                ไม่มีปัจจัยเสี่ยง
              </div>
            )}
          </div>
        </section>
      )}

      {/* 04 — Referral history */}
      {referrals.length > 0 && (
        <section>
          <SectionLabel
            idx={4}
            right={
              <span>
                {referrals.length} REFERRAL{referrals.length === 1 ? '' : 'S'}
              </span>
            }
          >
            Referral history
          </SectionLabel>
          <div
            className="mt-2 flex flex-col divide-y border bg-white"
            style={{ borderColor: 'var(--rule-strong)' }}
          >
            {referrals.map((ref) => {
              const statusLabel = REFERRAL_STATUS_LABEL[ref.status] ?? ref.status;
              const isArrived = ref.status === 'ARRIVED' || !!ref.arrivedAt;
              const isUrgent = ref.urgencyLevel === 'URGENT' || ref.urgencyLevel === 'EMERGENCY';
              return (
                <div
                  key={ref.id}
                  className="px-4 py-3"
                  style={{ borderColor: 'var(--rule-hair)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill
                      label={statusLabel}
                      color={
                        isArrived ? 'var(--risk-low)' : isUrgent ? 'var(--risk-high)' : 'var(--accent-navy)'
                      }
                    />
                    {ref.urgencyLevel && (
                      <Pill
                        label={ref.urgencyLevel}
                        color={isUrgent ? 'var(--risk-high)' : 'var(--ink-navy-muted)'}
                      />
                    )}
                    <span className="ml-auto font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]">
                      {formatThaiDateTime(ref.initiatedAt)}
                      {' · '}
                      {formatRelativeTime(ref.initiatedAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-[var(--ink-navy-dim)]">{ref.fromHospital}</span>
                    <ArrowRightLeft className="h-3.5 w-3.5 text-[var(--ink-navy-muted)]" />
                    <span className="font-semibold text-[var(--ink-navy)]">
                      {ref.toHospital}
                    </span>
                  </div>
                  {ref.reason && (
                    <div className="mt-1 text-[12px] text-[var(--ink-navy-dim)]">
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-navy-muted)]">
                        เหตุผล ·{' '}
                      </span>
                      {ref.reason}
                    </div>
                  )}
                  {ref.arrivedAt && (
                    <div className="mt-1 flex items-center gap-1 font-mono text-[11px] text-[var(--risk-low)]">
                      <CheckCircle2 className="h-3 w-3" />
                      ถึงปลายทาง {formatThaiDateTime(ref.arrivedAt)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 05 — Newborn outcomes */}
      {newborns.length > 0 && (
        <section>
          <SectionLabel
            idx={5}
            right={
              <span>
                {newborns.length} INFANT{newborns.length === 1 ? '' : 'S'}
              </span>
            }
          >
            Newborn outcomes
          </SectionLabel>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {newborns.map((nb) => {
              const lbw = nb.birthWeightG != null && nb.birthWeightG < 2500;
              const lowApgar1 = nb.apgar1min != null && nb.apgar1min < 7;
              const lowApgar5 = nb.apgar5min != null && nb.apgar5min < 7;
              return (
                <div
                  key={nb.infantNumber}
                  className="border bg-white p-4"
                  style={{ borderColor: 'var(--rule-strong)' }}
                >
                  <div className="flex items-baseline justify-between">
                    <div
                      className="font-semibold text-[15px]"
                      style={{ color: 'var(--ink-navy)' }}
                    >
                      <Baby className="mr-1 inline h-4 w-4 text-[var(--accent-navy)]" />
                      ทารกคนที่ {nb.infantNumber}
                      {nb.sex && (
                        <span className="ml-2 font-mono text-[11px] font-normal text-[var(--ink-navy-muted)]">
                          {SEX_LABEL_TH[nb.sex] ?? nb.sex}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]">
                      {formatThaiDateTime(nb.bornAt)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <MetricTile
                      label="BW"
                      value={nb.birthWeightG != null ? `${nb.birthWeightG}g` : '—'}
                      sub={lbw ? 'LBW!' : 'น้ำหนักแรกเกิด'}
                      color={lbw ? 'var(--risk-high)' : 'var(--risk-low)'}
                      icon={<Ruler className="h-3 w-3" />}
                    />
                    <MetricTile
                      label="APGAR 1"
                      value={nb.apgar1min ?? '—'}
                      sub={lowApgar1 ? 'LOW!' : '1 นาที'}
                      color={lowApgar1 ? 'var(--risk-high)' : 'var(--risk-low)'}
                    />
                    <MetricTile
                      label="APGAR 5"
                      value={nb.apgar5min ?? '—'}
                      sub={lowApgar5 ? 'LOW!' : '5 นาที'}
                      color={lowApgar5 ? 'var(--risk-high)' : 'var(--risk-low)'}
                    />
                  </div>
                  {(lbw || lowApgar1 || lowApgar5) && (
                    <div
                      className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-2"
                      style={{ borderColor: 'var(--rule-hair)' }}
                    >
                      <AlertTriangle className="h-3 w-3 text-[var(--risk-high)]" />
                      <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--risk-high)]">
                        ADVERSE OUTCOME — flagged for follow-up
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Footer */}
      <div
        className="mt-4 flex justify-between border-t pt-3 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <span>
          JOURNEY ID <span className="font-semibold text-[var(--ink-navy)]">{journey.id.slice(0, 8)}</span>
        </span>
        <span>
          REFRESHING EVERY 60s
        </span>
      </div>
    </div>
  );
}
