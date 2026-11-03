// Kiosk-only since UI sub-project 2; normal mode renders province/LaborVitalsSection + ContinuumSection.
// ProvinceVitalsStrip — merges the old SummaryCards + RiskDistributionChart
// into a single grid: total-with-risk-bar | HIGH | MED | LOW | 24h admissions.
// Replaces SummaryCards.tsx and RiskDistributionChart.tsx per the 2026-04-21 redesign.
//
// Each cell has a hover tooltip explaining what the number actually counts.
// Copy mirrors the SQL in services/dashboard.ts:getDashboardSummary and
// getDashboardTrends so the explanation can't drift from the metric without
// a code change. Same pattern as AlertBar above this strip.
'use client';

import type { ReactNode } from 'react';
import { VITALS_HINTS, admissionsHint } from './province/metric-hints';
import Link from 'next/link';
import type { DashboardSummary, DashboardTrends, DashboardContinuum } from '@/types/api';
import { RiskBar, StatCell, BarStrip } from './shared';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ANC_REGISTRY_CRITERIA_TH, ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';

interface ProvinceVitalsStripProps {
  summary: DashboardSummary;
  trends: DashboardTrends;
  /** Cross-board headline numbers (ANC registry + referral flow) — the labor
   *  vitals alone described ~11 patients while the province carried a
   *  1,169-woman ANC registry. Optional so kiosk/offline payloads degrade. */
  continuum?: DashboardContinuum | null;
}

// Small wrapper that turns any cell into a tooltip trigger. The cell content
// is passed as `children`; the rendered div becomes the grid cell, so the
// outer `<Tooltip>` (a context-only React node) doesn't disturb the grid
// layout and the StatCell's own border-left rail still sits at the cell edge.
function CellWithTooltip({
  ariaLabel,
  title,
  body,
  children,
  className,
}: {
  ariaLabel: string;
  title: string;
  body: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            tabIndex={0}
            aria-label={ariaLabel}
            className={
              'cursor-help outline-none focus-visible:bg-[var(--accent-navy-soft)]' +
              (className ? ` ${className}` : '')
            }
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm whitespace-normal text-left leading-snug">
        <div className="space-y-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="text-caption opacity-90">{body}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function ProvinceVitalsStrip({ summary, trends, continuum }: ProvinceVitalsStripProps) {
  const adm = admissionsHint(trends.admissionsToday, trends.admissions7dAvg);
  return (
    <>
      <div
        className="grid border-b border-[var(--rule-strong)] bg-white"
        style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.6fr' }}
      >
        {/* Total + inline risk bar */}
        <CellWithTooltip
          ariaLabel={`ACTIVE LABOR · PROVINCE: ${summary.totalActive} เคส (เสี่ยงต่ำ ${summary.totalLow}, เสี่ยงปานกลาง ${summary.totalMedium}, เสี่ยงสูง ${summary.totalHigh})`}
          title={VITALS_HINTS.active.title}
          body={VITALS_HINTS.active.body}
        >
          <div className="border-r border-[var(--rule-strong)] px-5 py-4">
            <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
              ACTIVE LABOR · PROVINCE
            </div>
            <div className="mt-1.5 flex items-baseline gap-2.5">
              <div
                className="font-mono text-kpi font-semibold leading-none text-[var(--ink-navy)] tabular-nums"
                style={{ letterSpacing: '-0.02em' }}
              >
                {summary.totalActive}
              </div>
              <div className="font-mono text-caption text-[var(--ink-navy-dim)]">เคสในห้องคลอด</div>
              <div
                className="ml-auto font-mono text-caption"
                style={{ color: 'var(--ink-navy-muted)' }}
              >
                +{trends.newByRisk24h.total} ราย/24h
              </div>
            </div>
            <div className="mt-2.5">
              <RiskBar
                low={summary.totalLow}
                medium={summary.totalMedium}
                high={summary.totalHigh}
                height={6}
              />
              <div className="mt-1.5 flex justify-between font-mono text-caption text-[var(--ink-navy-muted)]">
                <span>
                  <span style={{ color: 'var(--risk-low)' }}>■</span> LOW {summary.totalLow}
                </span>
                <span>
                  <span style={{ color: 'var(--risk-medium)' }}>■</span> MED {summary.totalMedium}
                </span>
                <span>
                  <span style={{ color: 'var(--risk-high)' }}>■</span> HIGH {summary.totalHigh}
                </span>
              </div>
            </div>
          </div>
        </CellWithTooltip>

        <CellWithTooltip
          ariaLabel={`HIGH RISK: ${summary.totalHigh} เคส, รับใหม่ ${trends.newByRisk24h.high} ใน 24 ชั่วโมง`}
          title={VITALS_HINTS.high.title}
          body={VITALS_HINTS.high.body}
        >
          <StatCell
            label="HIGH RISK"
            value={summary.totalHigh}
            delta={trends.newByRisk24h.high}
            color="var(--risk-high)"
          />
        </CellWithTooltip>

        <CellWithTooltip
          ariaLabel={`MEDIUM: ${summary.totalMedium} เคส, รับใหม่ ${trends.newByRisk24h.medium} ใน 24 ชั่วโมง`}
          title={VITALS_HINTS.medium.title}
          body={VITALS_HINTS.medium.body}
        >
          <StatCell
            label="MEDIUM"
            value={summary.totalMedium}
            delta={trends.newByRisk24h.medium}
            color="var(--risk-medium)"
          />
        </CellWithTooltip>

        <CellWithTooltip
          ariaLabel={`LOW: ${summary.totalLow} เคส, รับใหม่ ${trends.newByRisk24h.low} ใน 24 ชั่วโมง`}
          title={VITALS_HINTS.low.title}
          body={VITALS_HINTS.low.body}
        >
          <StatCell
            label="LOW"
            value={summary.totalLow}
            delta={trends.newByRisk24h.low}
            color="var(--risk-low)"
          />
        </CellWithTooltip>

        {/* 24h admissions */}
        <CellWithTooltip
          ariaLabel={`ADMISSIONS · LAST 24H: ${trends.admissionsToday} today, avg ${trends.admissions7dAvg.toFixed(1)} per day`}
          title={adm.title}
          body={adm.body}
        >
          <div className="border-l border-[var(--rule-strong)] px-5 py-3">
            <div className="flex items-baseline justify-between">
              <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
                ADMISSIONS · LAST 24H
              </div>
              <div className="font-mono text-caption text-[var(--ink-navy-dim)]">
                <span className="font-semibold text-[var(--ink-navy)]">
                  {trends.admissionsToday}
                </span>{' '}
                today · avg {trends.admissions7dAvg.toFixed(1)}
              </div>
            </div>
            <div className="mt-1.5">
              <BarStrip
                values={trends.admissions24h}
                width={280}
                height={26}
                color="var(--accent-navy)"
              />
              <div className="mt-0.5 flex justify-between font-mono text-caption text-[var(--ink-navy-muted)]">
                <span>−24h</span>
                <span>−18h</span>
                <span>−12h</span>
                <span>−6h</span>
                <span>NOW</span>
              </div>
            </div>
          </div>
        </CellWithTooltip>
      </div>

      {/* Continuum row — ANC registry + referral flow headline numbers, linked
        to their boards. Same sources as the boards, so they cannot drift. */}
      {continuum && (
        <div
          className="grid border-b border-[var(--rule-strong)] bg-white"
          style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.6fr' }}
          data-testid="continuum-strip"
        >
          <Link
            href="/pregnancies"
            title={ANC_REGISTRY_CRITERIA_TH}
            className="border-r border-[var(--rule-strong)] px-5 py-3 transition-colors hover:bg-[var(--accent-navy-soft)]"
          >
            <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
              ANC REGISTRY
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-page font-semibold leading-none tabular-nums text-[var(--accent-navy)]">
                {continuum.anc.total}
              </span>
              {/* Was "หญิงตั้งครรภ์ทั้งจังหวัด" — it read as every pregnant woman in
                the province, which is the one thing this number is not. */}
              <span className="font-mono text-caption text-[var(--ink-navy-muted)]">
                {ANC_REGISTRY_LABEL_TH}
              </span>
            </div>
          </Link>
          <Link
            href="/pregnancies?risk=HR3"
            className="border-r border-[var(--rule-strong)] px-5 py-3 transition-colors hover:bg-[var(--accent-navy-soft)]"
          >
            <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
              HR3
            </div>
            <div
              className="mt-1 font-mono text-page font-semibold leading-none tabular-nums"
              style={{ color: 'var(--risk-high)' }}
            >
              {continuum.anc.hr3}
            </div>
          </Link>
          <Link
            href="/pregnancies?cohort=due_soon"
            className="border-r border-[var(--rule-strong)] px-5 py-3 transition-colors hover:bg-[var(--accent-navy-soft)]"
          >
            <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
              DUE ≤14D
            </div>
            <div
              className="mt-1 font-mono text-page font-semibold leading-none tabular-nums"
              style={{ color: 'var(--risk-medium)' }}
            >
              {continuum.anc.dueSoon}
            </div>
          </Link>
          <Link
            href="/referrals"
            className="border-r border-[var(--rule-strong)] px-5 py-3 transition-colors hover:bg-[var(--accent-navy-soft)]"
          >
            <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
              REFERRALS 7D
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-page font-semibold leading-none tabular-nums text-[var(--ink-navy)]">
                {continuum.referrals.last7d}
              </span>
              <span className="font-mono text-caption text-[var(--ink-navy-muted)]">
                วันนี้ {continuum.referrals.today}
              </span>
            </div>
          </Link>
          <div className="flex items-center px-5 py-3 font-mono text-caption tracking-[0.1em] text-[var(--ink-navy-muted)]">
            CARE CONTINUUM · คลิกเพื่อเปิดหน้ารายการ
          </div>
        </div>
      )}
    </>
  );
}
