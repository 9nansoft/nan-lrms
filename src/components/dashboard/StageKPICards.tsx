// StageKPICards — demoted to below-the-fold per the 2026-04-21 redesign (§5 of brief).
// Now a flat 3-up card strip with simple breakdown rows; no gradients, no overlap
// with the province vitals strip.
'use client';

import type { DashboardStageKPIs } from '@/types/api';

interface StageKPICardsProps {
  stageKPIs: DashboardStageKPIs;
}

interface StageCardProps {
  title: string;
  total: number;
  rows: Array<[string, number, string]>;
}

function StageCard({ title, total, rows }: StageCardProps) {
  return (
    <div className="border border-[var(--rule-strong)] bg-white p-3.5">
      <div className="flex items-baseline justify-between">
        <div className="text-[13px] font-semibold text-[var(--ink-navy)]">{title}</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink-navy)]">
          {total}
        </div>
      </div>
      <div className="mt-2.5 flex flex-col gap-1">
        {rows.map(([label, value, color]) => (
          <div
            key={label}
            className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-navy-dim)]"
          >
            <div style={{ width: 6, height: 6, background: color }} aria-hidden="true" />
            <div className="flex-1">{label}</div>
            <div className="font-semibold tabular-nums text-[var(--ink-navy)]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StageKPICards({ stageKPIs }: StageKPICardsProps) {
  return (
    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
      <StageCard
        title="ANC กำลังติดตาม"
        total={stageKPIs.pregnancy.total}
        rows={[
          ['LOW', stageKPIs.pregnancy.low, 'var(--risk-low)'],
          ['HR1', stageKPIs.pregnancy.hr1, 'var(--risk-medium)'],
          ['HR2', stageKPIs.pregnancy.hr2, 'var(--risk-medium)'],
          ['HR3', stageKPIs.pregnancy.hr3, 'var(--risk-high)'],
        ]}
      />
      <StageCard
        title="ในห้องคลอด"
        total={stageKPIs.labor.total}
        rows={[
          ['LOW', stageKPIs.labor.low, 'var(--risk-low)'],
          ['MED', stageKPIs.labor.medium, 'var(--risk-medium)'],
          ['HIGH', stageKPIs.labor.high, 'var(--risk-high)'],
        ]}
      />
      <StageCard
        title="คลอดแล้ว · 24h"
        total={stageKPIs.delivered.total}
        rows={[
          ['NORMAL', stageKPIs.delivered.normal, 'var(--risk-low)'],
          ['LOW APGAR', stageKPIs.delivered.lowApgar, 'var(--risk-medium)'],
          ['LBW', stageKPIs.delivered.lbw, 'var(--risk-high)'],
        ]}
      />
    </div>
  );
}
