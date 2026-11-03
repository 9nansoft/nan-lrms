// ShiftSummary — "this shift vs. last" for the coordinator. Wired to
// DashboardTrends since 2026-04-21 (server aggregates). UI sub-project 2:
// a Thai SectionCard of KpiTiles.
'use client';

import type { DashboardTrends } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';

interface ShiftSummaryProps {
  trends: DashboardTrends;
}

export function ShiftSummary({ trends }: ShiftSummaryProps) {
  const { currentShift, previousShift } = trends;
  const rows = [
    { key: 'admissions', label: 'รับเข้า', now: currentShift.admissions, prev: previousShift.admissions },
    { key: 'delivered', label: 'คลอด', now: currentShift.delivered, prev: previousShift.delivered },
    { key: 'referred', label: 'ส่งต่อ', now: currentShift.referred, prev: previousShift.referred },
  ] as const;

  return (
    <SectionCard
      title="สรุปเวร"
      description={previousShift.label ? `เปรียบเทียบกับ ${previousShift.label}` : undefined}
      actions={
        <span
          className="text-label text-ink-muted"
          title={`เวรปัจจุบันเริ่ม ${new Date(currentShift.windowStart).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`}
        >
          {currentShift.label || '—'}
        </span>
      }
    >
      <KpiGrid>
        {rows.map((r) => (
          <KpiTile
            key={r.key}
            testId={`shift-${r.key}`}
            label={r.label}
            count={r.now}
            sub={`เวรก่อน ${r.prev.toLocaleString('en-US')}`}
          />
        ))}
      </KpiGrid>
    </SectionCard>
  );
}
