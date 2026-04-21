// ProvinceVitalsStrip — merges the old SummaryCards + RiskDistributionChart
// into a single grid: total-with-risk-bar | HIGH | MED | LOW | 24h admissions.
// Replaces SummaryCards.tsx and RiskDistributionChart.tsx per the 2026-04-21 redesign.
'use client';

import type { DashboardSummary, DashboardTrends } from '@/types/api';
import { RiskBar, StatCell, BarStrip } from './shared';

interface ProvinceVitalsStripProps {
  summary: DashboardSummary;
  trends: DashboardTrends;
}

export function ProvinceVitalsStrip({ summary, trends }: ProvinceVitalsStripProps) {
  return (
    <div
      className="grid border-b border-[var(--rule-strong)] bg-white"
      style={{ gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1.6fr' }}
    >
      {/* Total + inline risk bar */}
      <div className="border-r border-[var(--rule-strong)] px-5 py-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
          ACTIVE LABOR · PROVINCE
        </div>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <div
            className="font-mono text-[44px] font-semibold leading-none text-[var(--ink-navy)] tabular-nums"
            style={{ letterSpacing: '-0.02em' }}
          >
            {summary.totalActive}
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">เคสในห้องคลอด</div>
          <div
            className="ml-auto font-mono text-[11px]"
            style={{ color: 'var(--ink-navy-muted)' }}
            title="จำนวนผู้ป่วยที่เข้าห้องคลอดในช่วง 24 ชั่วโมงที่ผ่านมา"
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
          <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--ink-navy-muted)]">
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

      <StatCell
        label="HIGH RISK"
        value={summary.totalHigh}
        delta={trends.newByRisk24h.high}
        color="var(--risk-high)"
      />
      <StatCell
        label="MEDIUM"
        value={summary.totalMedium}
        delta={trends.newByRisk24h.medium}
        color="var(--risk-medium)"
      />
      <StatCell
        label="LOW"
        value={summary.totalLow}
        delta={trends.newByRisk24h.low}
        color="var(--risk-low)"
      />

      {/* 24h admissions */}
      <div className="border-l border-[var(--rule-strong)] px-5 py-3">
        <div className="flex items-baseline justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
            ADMISSIONS · LAST 24H
          </div>
          <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">
            <span className="font-semibold text-[var(--ink-navy)]">{trends.admissionsToday}</span>{' '}
            today · avg {trends.admissions7dAvg.toFixed(1)}
          </div>
        </div>
        <div className="mt-1.5">
          <BarStrip values={trends.admissions24h} width={280} height={26} color="var(--accent-navy)" />
          <div className="mt-0.5 flex justify-between font-mono text-[9px] text-[var(--ink-navy-muted)]">
            <span>−24h</span>
            <span>−18h</span>
            <span>−12h</span>
            <span>−6h</span>
            <span>NOW</span>
          </div>
        </div>
      </div>
    </div>
  );
}
