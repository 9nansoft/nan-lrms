// StageKPICards — care-continuum 3-up strip. Each card links to its board
// (2026-07-09): the dashboard summarises, the boards operate. The delivered
// card is labelled by its real window (Bangkok month). UI sub-project 2: Thai
// row labels that state exactly what getStageKPIs counts; tokens; no wraps.
'use client';

import Link from 'next/link';
import type { DashboardStageKPIs } from '@/types/api';
import { KpiGrid } from '@/components/shared/KpiGrid';

interface StageKPICardsProps {
  stageKPIs: DashboardStageKPIs;
}

interface StageRow {
  label: string;
  value: number;
  color: string;
  title?: string;
}

interface StageCardProps {
  title: string;
  total: number;
  href: string;
  rows: StageRow[];
}

function StageCard({ title, total, href, rows }: StageCardProps) {
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-2xl bg-surface-card p-4 shadow-soft outline-none transition-colors hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-body-lg text-ink">{title}</div>
        <div data-kpi-value className="whitespace-nowrap text-kpi-sm tabular-nums text-brand">
          {total.toLocaleString('en-US')}
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} title={r.title} className="flex items-center gap-2 text-label text-ink-muted">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="min-w-0 flex-1">{r.label}</span>
            <span className="font-semibold tabular-nums text-ink">{r.value.toLocaleString('en-US')}</span>
          </div>
        ))}
      </div>
    </Link>
  );
}

export function StageKPICards({ stageKPIs }: StageKPICardsProps) {
  return (
    <KpiGrid min="md">
      <StageCard
        title="ANC กำลังติดตาม"
        total={stageKPIs.pregnancy.total}
        href="/pregnancies"
        rows={[
          { label: 'เสี่ยงต่ำ', value: stageKPIs.pregnancy.low, color: 'var(--risk-low)' },
          { label: 'HR1', value: stageKPIs.pregnancy.hr1, color: 'var(--risk-medium)' },
          { label: 'HR2', value: stageKPIs.pregnancy.hr2, color: 'var(--risk-medium)' },
          { label: 'HR3', value: stageKPIs.pregnancy.hr3, color: 'var(--risk-high)' },
        ]}
      />
      <StageCard
        title="ในห้องคลอด"
        total={stageKPIs.labor.admitted}
        href="/hospitals"
        rows={[
          // Labouring vs delivered-and-postpartum are both admitted. Neutral
          // colours: these are stages, not risk ("delivered" is not "safe" —
          // PPH happens exactly then). CPD high stays as the clinical signal.
          { label: 'รอคลอด', value: stageKPIs.labor.awaitingDelivery, color: 'var(--ink)' },
          { label: 'คลอดแล้ว', value: stageKPIs.labor.deliveredAdmitted, color: 'var(--ink-muted)' },
          { label: 'CPD เสี่ยงสูง', value: stageKPIs.labor.high, color: 'var(--risk-high)' },
        ]}
      />
      <StageCard
        title="คลอดแล้ว · เดือนนี้"
        total={stageKPIs.delivered.total}
        href="/outcomes"
        rows={[
          // normal = total − newborns with apgar_5min < 7 OR birth_weight_g < 2500;
          // deliveries with missing newborn/Apgar/weight data count here, so the
          // label claims only "no recorded abnormality".
          {
            label: 'ไม่พบความผิดปกติที่บันทึก',
            value: stageKPIs.delivered.normal,
            color: 'var(--risk-low)',
            title: 'การคลอดที่ไม่มีบันทึก Apgar 5 นาที < 7 หรือน้ำหนักแรกเกิด < 2,500 ก. รวมรายที่ยังไม่มีข้อมูลทารก',
          },
          { label: 'Apgar 5 นาที < 7', value: stageKPIs.delivered.lowApgar, color: 'var(--risk-medium)' },
          { label: 'น้ำหนักแรกเกิด < 2,500 ก.', value: stageKPIs.delivered.lbw, color: 'var(--risk-high)' },
        ]}
      />
    </KpiGrid>
  );
}
