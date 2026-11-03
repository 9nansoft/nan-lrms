// HighRiskPatientList — primary zone on the redesigned 2026-04-21 dashboard.
// Dense tabular view with partograph severity, vitals freshness, and clinical note.
// Kiosk mode: HN/AN only (no names) per privacy decision in the design chat.
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import { RISK_LEVELS, classifyRiskLevel } from '@/config/risk-levels';
import { ANC_OPS } from '@/config/anc-ops';
import { RiskLevel } from '@/types/domain';
import { RiskChip as SharedRiskChip } from '@/components/shared/RiskChip';
import { EmptyState } from '@/components/shared/EmptyState';
import { cn, formatRelativeTime, buildPatientId } from '@/lib/utils';
import { maskName } from '@/lib/pii-mask';
import type { CdssSeverity } from '@/types/api';
import type { MaternalScreenLocalTier, MaternalEmergencyAcuity } from '@/types/maternal-screening';
import { PartographCell, SectionLabel } from './shared';
import { MaternalScreenCell } from './MaternalScreenCell';

export interface HighRiskPatient {
  an: string;
  hn: string;
  name: string;
  age: number | null;
  gaWeeks: number | null;
  cpdScore: number;
  riskLevel: string;
  hospital: string;
  hcode: string;
  admitDate: string | null;
  /** Birth time, or null if she has not delivered. This list is "admitted and
   *  not discharged", so a delivered mother stays on it — she is postpartum on
   *  the ward, not gone — and this is what distinguishes her. */
  deliveredAt?: string | null;
  lastVitalAt: string | null;
  partographSeverity?: CdssSeverity | null;
  partographAlertCount?: number | null;
  note?: string | null;
  // GC3: maternal labor-triage screening axes — a separate vocabulary from
  // partographSeverity/CdssSeverity above (never merge). Rendering these is
  // W2; this task only keeps the local copy in sync with src/types/api.ts.
  maternalScreenLocalTier?: MaternalScreenLocalTier | null;
  maternalScreenEmergencyAcuity?: MaternalEmergencyAcuity | null;
  maternalScreenIsComplete?: boolean | null;
  maternalScreenAssessedAt?: string | null;
}

export interface HighRiskPatientListProps {
  patients: HighRiskPatient[];
  isLoading?: boolean;
  variant?: 'light' | 'kiosk';
  maxRows?: number;
  /** ANC pressure shown in the empty state — with a quiet labor floor the
   *  panel would otherwise read as "nothing to watch" while high-risk
   *  pregnancies are approaching term. */
  ancFallback?: { hr3: number; dueSoon: number } | null;
  /** True population counts for the header/tab badges. The patients array is
   *  a row-limited fetch, so deriving counts from its length undercounts once
   *  the roster exceeds the cap — callers that hold real COUNTs (dashboard
   *  summary, per-hospital counts) pass them here. */
  totalActive?: number | null;
  totalHigh?: number | null;
  /** Inside a SectionCard that already titles the list: omit the legacy
   *  SectionLabel header. Kiosk and HospitalDetailDialog leave it false. */
  embedded?: boolean;
}

/** Kiosk CPD colour: kiosk palette, but the tier boundaries are the shared
 *  RISK_LEVELS rule (classifyRiskLevel) so a score reads the same on every screen. */
function kioskCpdColor(score: number): string {
  const level = classifyRiskLevel(score);
  return level === RiskLevel.HIGH ? 'var(--kiosk-high)' : level === RiskLevel.MEDIUM ? 'var(--kiosk-med)' : 'var(--kiosk-low)';
}

function KioskRiskChip({ riskLevel, variant }: { riskLevel: string; variant: 'light' | 'kiosk' }) {
  const isKiosk = variant === 'kiosk';
  const color =
    riskLevel === 'HIGH'
      ? isKiosk
        ? 'var(--kiosk-high)'
        : 'var(--risk-high)'
      : riskLevel === 'MEDIUM'
        ? isKiosk
          ? 'var(--kiosk-med)'
          : 'var(--risk-medium)'
        : isKiosk
          ? 'var(--kiosk-low)'
          : 'var(--risk-low)';

  return (
    <span
      data-risk={riskLevel}
      className={cn(
        'inline-block border px-1.5 py-0.5 text-center font-mono text-caption font-semibold tracking-[0.04em]',
        isKiosk && riskLevel === 'HIGH' && 'shadow-[0_0_8px_var(--kiosk-high)]',
      )}
      style={{
        color,
        borderColor: color,
        background: 'transparent',
      }}
    >
      {riskLevel}
    </span>
  );
}

/** Light variant: the shared RiskChip, so colour and Thai naming match every
 *  other screen. Unknown values render as plain text rather than looking safe. */
function LightRiskChip({ riskLevel }: { riskLevel: string }) {
  const level = Object.hasOwn(RISK_LEVELS, riskLevel) ? (riskLevel as RiskLevel) : null;
  if (!level) return <span className="text-caption text-ink-muted">{riskLevel || '—'}</span>;
  return (
    <SharedRiskChip level={level} size="sm" data-risk={riskLevel}>
      {RISK_LEVELS[level].shortLabelTh}
    </SharedRiskChip>
  );
}

/** Where this woman is in her labour, for a board that lists everyone admitted
 *  and not yet discharged.
 *
 *  Both states are meaningful and neither is an error: รอคลอด is still in
 *  labour, คลอดแล้ว has given birth and is on the ward postpartum — still
 *  needing watching (PPH), which is exactly why she is not removed from the
 *  list. Deliberately NOT colour-coded on the risk palette: clinical risk is
 *  the RISK / CPD / PARTOGRAPH columns' job, and reusing those colours here
 *  would read as "delivered = safe". */
function LaborStageCell({
  deliveredAt,
  isKiosk,
}: {
  deliveredAt: string | null;
  isKiosk: boolean;
}) {
  const delivered = Boolean(deliveredAt);
  // Same kiosk-aware tokens the parent derives — the kiosk theme is a different
  // palette entirely, so hardcoding the light-mode vars would render this cell
  // near-invisible on the ward monitor.
  const ink = isKiosk ? 'var(--kiosk-ink)' : 'var(--ink-navy)';
  const inkDim = isKiosk ? 'var(--kiosk-dim)' : 'var(--ink-navy-dim)';
  const inkMuted = isKiosk ? 'var(--kiosk-dim)' : 'var(--ink-navy-muted)';
  const ruleStrong = isKiosk ? 'var(--kiosk-rule)' : 'var(--rule-strong)';
  const ruleHair = isKiosk ? 'var(--kiosk-rule)' : 'var(--rule-hair)';
  return (
    <div style={{ fontSize: isKiosk ? 13 : MIN_TEXT_PX, lineHeight: 1.25 }}>
      <span
        className="inline-block border px-1.5 py-0.5 font-mono tracking-[0.04em] whitespace-nowrap"
        style={{
          color: delivered ? inkDim : ink,
          borderColor: delivered ? ruleHair : ruleStrong,
          background: 'transparent',
        }}
      >
        {delivered ? 'คลอดแล้ว' : 'รอคลอด'}
      </span>
      {delivered && (
        <div className="font-mono" style={{ color: inkMuted, fontSize: MIN_TEXT_PX }}>
          {admitTime(deliveredAt)}
        </div>
      )}
    </div>
  );
}

function admitTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** How long she has been admitted, as a duration.
 *
 *  Deliberately NOT formatRelativeTime: that collapses to a calendar date past
 *  24h, which hides the number that matters most. A woman on the labour board
 *  for three days is the single loudest signal on it — prolonged labour
 *  clinically, and a data-entry or discharge problem operationally (the
 *  รพ.น้ำพอง admissions sat for days behind an unchanged "08:28"). */
function admitElapsed(iso: string | null): string | null {
  if (!iso) return null;
  // Clock read lives here, not in the component body: reading it during render
  // trips react-hooks/purity. This mirrors formatRelativeTime, which the LAST
  // VITAL column beside this one already uses. The value refreshes on the
  // dashboard's normal SWR re-render rather than ticking on its own.
  const now = Date.now();
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const mins = Math.floor((now - ms) / 60000);
  // Clock skew between the hospital's HOSxP and this server can put an
  // admission a few minutes in the future; show it as brand new, not negative.
  if (mins < 1) return 'เพิ่งรับ';
  if (mins < 60) return `${mins}น`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem === 0 ? `${hours}ชม` : `${hours}ชม ${rem}น`;
  }
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH === 0 ? `${days}ว` : `${days}ว ${remH}ชม`;
}

function vitalFreshness(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'ไม่มีข้อมูล', stale: true };
  return { text: formatRelativeTime(iso) ?? '—', stale: false };
}

function SkeletonRow({
  variant,
  gridCols,
  count,
}: {
  variant: 'light' | 'kiosk';
  /** The same template the rows use — one source, no hand-kept copy. */
  gridCols: string;
  count: number;
}) {
  const barBg = variant === 'kiosk' ? 'bg-white/10' : 'bg-surface-muted';
  return (
    <div
      className="grid items-center gap-2 border-b px-2 py-2"
      style={{
        gridTemplateColumns: gridCols,
        borderColor: variant === 'kiosk' ? 'var(--kiosk-rule)' : 'var(--rule-hair)',
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('h-3 animate-pulse rounded', barBg)} />
      ))}
    </div>
  );
}

export function HighRiskPatientList({
  patients,
  isLoading = false,
  variant = 'light',
  maxRows,
  ancFallback,
  totalActive,
  totalHigh,
  embedded = false,
}: HighRiskPatientListProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'high' | 'all'>('high');

  const sorted = useMemo(() => [...patients].sort((a, b) => b.cpdScore - a.cpdScore), [patients]);

  const shown = useMemo(() => {
    const base = tab === 'high' ? sorted.filter((p) => p.riskLevel === 'HIGH') : sorted;
    return maxRows ? base.slice(0, maxRows) : base;
  }, [sorted, tab, maxRows]);

  const counts = useMemo(
    () => ({
      high: totalHigh ?? sorted.filter((p) => p.riskLevel === 'HIGH').length,
      total: totalActive ?? sorted.length,
    }),
    [sorted, totalActive, totalHigh],
  );

  const isKiosk = variant === 'kiosk';
  const ruleStrong = isKiosk ? 'var(--kiosk-rule)' : 'var(--rule-strong)';
  const ruleHair = isKiosk ? 'var(--kiosk-rule)' : 'var(--rule-hair)';
  const ink = isKiosk ? 'var(--kiosk-ink)' : 'var(--ink-navy)';
  const inkDim = isKiosk ? 'var(--kiosk-dim)' : 'var(--ink-navy-dim)';
  const inkMuted = isKiosk ? 'var(--kiosk-dim)' : 'var(--ink-navy-muted)';
  const accent = isKiosk ? 'var(--kiosk-accent)' : 'var(--accent-navy)';

  // Column widths — kiosk drops name + note (privacy + space).
  // 'screen' (GC-W2) is a SEPARATE slot from 'partograph' — maternal
  // labor-triage screening axes never merge into partograph severity.
  const columns = isKiosk
    ? [
        { key: 'risk', label: 'RISK', w: 72 },
        { key: 'anhn', label: 'AN / HN', w: 140 },
        { key: 'ga', label: 'GA', w: 50 },
        { key: 'cpd', label: 'CPD', w: 50 },
        { key: 'hospital', label: 'HOSPITAL', w: 0 }, // flex 1
        { key: 'admit', label: 'ADMIT / นาน', w: 86 },
        { key: 'labor', label: 'สถานะ', w: 92 },
        { key: 'partograph', label: 'PARTOGRAPH', w: 120 },
        { key: 'screen', label: 'คัดกรอง (เงา)', w: 130 },
      ]
    : [
        { key: 'risk', label: 'ความเสี่ยง', w: 76 },
        { key: 'anhn', label: 'AN / HN', w: 130 },
        { key: 'patient', label: 'ผู้คลอด', w: 0 }, // flex 1
        { key: 'ga', label: 'GA', w: 44 },
        { key: 'cpd', label: 'CPD', w: 44 },
        { key: 'hospital', label: 'โรงพยาบาล', w: 150 },
        { key: 'admit', label: 'รับเข้า / นาน', w: 84 },
        { key: 'labor', label: 'สถานะ', w: 88 },
        { key: 'vital', label: 'สัญญาณชีพล่าสุด', w: 96 },
        { key: 'partograph', label: 'พาร์โทกราฟ', w: 110 },
        { key: 'screen', label: 'คัดกรอง (เงา)', w: 140 },
        { key: 'note', label: 'หมายเหตุ', w: 220 },
      ];

  // `minmax(180px, 1fr)` — not plain `1fr` — so a flex column shrinks below
  // its content's intrinsic min-size. Without this, a long truncated patient
  // name (which has `white-space: nowrap`) expanded the auto-min past the
  // header's, and each row resolved `1fr` to a different width — breaking
  // column alignment row-to-row (each row is its own grid container). The
  // 180px floor keeps the patient name readable when total width overflows.
  const gridCols = columns.map((c) => (c.w === 0 ? 'minmax(180px, 1fr)' : `${c.w}px`)).join(' ');

  return (
    <div>
      {!embedded && (
        <SectionLabel idx={1} right={<span>AUTO-SORT · HIGH → MED · {counts.total} ACTIVE</span>}>
          High-risk &amp; Active labor
        </SectionLabel>
      )}

      {/* Tabs */}
      {!isKiosk && (
        <div className="mt-2.5 mb-2.5 flex gap-0 border-b" style={{ borderColor: ruleHair }}>
          {[
            { k: 'high', l: 'เฉพาะเสี่ยงสูง', n: counts.high },
            { k: 'all', l: 'ทั้งหมดในห้องคลอด', n: counts.total },
          ].map((x) => (
            <button
              key={x.k}
              type="button"
              aria-pressed={tab === x.k}
              onClick={() => setTab(x.k as 'high' | 'all')}
              className={cn(
                'border-b-2 bg-transparent px-3.5 py-2 text-label',
                tab === x.k ? 'font-semibold' : 'font-normal',
              )}
              style={{
                borderColor: tab === x.k ? accent : 'transparent',
                color: tab === x.k ? accent : inkMuted,
              }}
            >
              {x.l} <span style={{ color: inkMuted, fontWeight: 400 }}>· {x.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        {/* Header */}
        <div
          className={cn(
            'grid gap-2 border-t border-b px-2 py-2 text-caption',
            isKiosk ? 'font-mono tracking-[0.1em]' : 'font-semibold',
          )}
          style={{
            gridTemplateColumns: gridCols,
            color: inkMuted,
            borderColor: ruleStrong,
          }}
        >
          {columns.map((c) => (
            <div key={c.key}>{c.label}</div>
          ))}
        </div>

        {/* Body */}
        {isLoading ? (
          <>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRow key={i} variant={variant} gridCols={gridCols} count={columns.length} />
            ))}
          </>
        ) : shown.length === 0 ? (
          isKiosk ? (
            <div
              className="border-b px-2 py-8 text-center font-mono text-caption"
              style={{ color: inkMuted, borderColor: ruleHair }}
            >
              <div>ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้</div>
              {ancFallback && (ancFallback.hr3 > 0 || ancFallback.dueSoon > 0) && (
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <span>เฝ้าระวังล่วงหน้า:</span>
                  <Link
                    href="/pregnancies?risk=HR3"
                    className="underline decoration-dotted underline-offset-2"
                    style={{ color: 'var(--risk-high)' }}
                  >
                    ครรภ์เสี่ยงสูง HR3 {ancFallback.hr3} ราย
                  </Link>
                  <Link
                    href="/pregnancies?cohort=due_soon"
                    className="underline decoration-dotted underline-offset-2"
                    style={{ color: 'var(--risk-medium)' }}
                  >
                    ใกล้คลอด ≤14 วัน {ancFallback.dueSoon} ราย
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              illustration="ward"
              className="mt-3 shadow-none"
              title={tab === 'high' ? 'ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้' : 'ไม่มีผู้คลอดในห้องคลอดขณะนี้'}
              description={
                ancFallback && (ancFallback.hr3 > 0 || ancFallback.dueSoon > 0) ? (
                  <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                    <span>เฝ้าระวังล่วงหน้า:</span>
                    <Link
                      href="/pregnancies?risk=HR3"
                      className="text-danger-text underline decoration-dotted underline-offset-2"
                    >
                      ครรภ์เสี่ยงสูง HR3 {ancFallback.hr3} ราย
                    </Link>
                    <Link
                      href="/pregnancies?cohort=due_soon"
                      className="text-warn-text underline decoration-dotted underline-offset-2"
                    >
                      ใกล้คลอด ≤{ANC_OPS.dueSoonDays} วัน {ancFallback.dueSoon} ราย
                    </Link>
                  </span>
                ) : undefined
              }
            />
          )
        ) : (
          shown.map((p, i) => {
            const isHigh = p.riskLevel === 'HIGH';
            const isCritical = isHigh || p.partographSeverity === 'CRITICAL';
            const freshness = vitalFreshness(p.lastVitalAt);
            return (
              <div
                key={p.an}
                data-testid="patient-row"
                onClick={() => router.push(`/patients/${buildPatientId(p.hcode, p.an)}`)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/patients/${buildPatientId(p.hcode, p.an)}`);
                  }
                }}
                tabIndex={0}
                role="button"
                className={cn(
                  'grid cursor-pointer items-center gap-2 border-b px-2 text-sm transition-colors',
                  !isKiosk && 'hover:bg-surface-muted',
                  isKiosk && 'hover:bg-white/5',
                )}
                style={{
                  gridTemplateColumns: gridCols,
                  height: isKiosk ? 56 : 44,
                  borderColor: ruleHair,
                  background:
                    i === 0 && isCritical
                      ? isKiosk
                        ? 'linear-gradient(to right, rgba(224,92,92,0.18), transparent 60%)'
                        : `linear-gradient(to right, ${COLOR.riskHighTint}, transparent 40%)`
                      : 'transparent',
                }}
              >
                <div>
                  {isKiosk ? <KioskRiskChip riskLevel={p.riskLevel} variant={variant} /> : <LightRiskChip riskLevel={p.riskLevel} />}
                </div>
                <div className="font-mono" style={{ color: ink, fontSize: isKiosk ? 14 : MIN_TEXT_PX }}>
                  <div className="font-semibold">{p.an}</div>
                  <div
                    className="font-normal"
                    style={{ color: inkMuted, fontSize: isKiosk ? 11 : MIN_TEXT_PX }}
                  >
                    HN {p.hn}
                  </div>
                </div>
                {!isKiosk && (
                  <div style={{ color: ink, fontSize: 13 }}>
                    <div className="truncate">
                      {p.name ? maskName(p.name) : <span style={{ color: inkMuted }}>ไม่ระบุ</span>}
                    </div>
                    <div className="font-mono" style={{ color: inkMuted, fontSize: MIN_TEXT_PX }}>
                      {p.age != null ? `อายุ ${p.age}` : '—'}
                    </div>
                  </div>
                )}
                <div
                  className="font-mono tabular-nums"
                  style={{ color: ink, fontSize: isKiosk ? 18 : 13 }}
                >
                  {p.gaWeeks != null ? (
                    <>
                      {p.gaWeeks}
                      <span style={{ color: inkMuted, fontSize: isKiosk ? 11 : MIN_TEXT_PX }}>w</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div
                  className="font-mono font-semibold tabular-nums"
                  style={{
                    color: isKiosk ? kioskCpdColor(p.cpdScore) : RISK_LEVELS[classifyRiskLevel(p.cpdScore)].textColor,
                    fontSize: isKiosk ? 20 : 13,
                    textShadow:
                      isKiosk && classifyRiskLevel(p.cpdScore) !== RiskLevel.LOW
                        ? `0 0 8px ${kioskCpdColor(p.cpdScore)}`
                        : 'none',
                  }}
                >
                  {p.cpdScore}
                </div>
                <div className="truncate" style={{ color: ink, fontSize: isKiosk ? 14 : MIN_TEXT_PX }}>
                  {p.hospital}
                </div>
                <div className="font-mono" style={{ color: ink, fontSize: isKiosk ? 14 : MIN_TEXT_PX }}>
                  {admitTime(p.admitDate)}
                  {(() => {
                    const elapsed = admitElapsed(p.admitDate);
                    return elapsed ? (
                      <div
                        style={{
                          color: inkMuted,
                          fontSize: isKiosk ? 11 : MIN_TEXT_PX,
                          fontWeight: 400,
                        }}
                      >
                        {elapsed}
                      </div>
                    ) : null;
                  })()}
                </div>
                <LaborStageCell deliveredAt={p.deliveredAt ?? null} isKiosk={isKiosk} />
                {!isKiosk && (
                  <div
                    className="font-mono"
                    style={{
                      color: freshness.stale ? inkMuted : inkDim,
                      fontSize: MIN_TEXT_PX,
                    }}
                  >
                    {freshness.text}
                  </div>
                )}
                <div>
                  <PartographCell
                    severity={p.partographSeverity ?? null}
                    count={p.partographAlertCount ?? 0}
                    variant={variant}
                  />
                </div>
                <div>
                  <MaternalScreenCell
                    tier={p.maternalScreenLocalTier ?? null}
                    acuity={p.maternalScreenEmergencyAcuity ?? null}
                    isComplete={p.maternalScreenIsComplete ?? null}
                    assessedAt={p.maternalScreenAssessedAt ?? null}
                    variant={variant}
                  />
                </div>
                {!isKiosk && (
                  <div
                    className="truncate font-mono"
                    style={{ color: inkDim, fontSize: MIN_TEXT_PX }}
                    title={p.note ?? undefined}
                  >
                    {p.note ?? ''}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
