// ห้องคลอดทั้งจังหวัด — active labour by CPD risk plus the 24-hour admission
// histogram. Every number is a /api/dashboard aggregate (summary / trends).
'use client';

import type { DashboardSummary, DashboardTrends } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { HintButton } from '@/components/shared/HintButton';
import { BarStrip, RiskBar } from '@/components/dashboard/shared';
import { LABOR_TILE_HINTS, laborAdmissionsHint } from './metric-hints';

// Bucket 0 starts 23 h before the start of the current hour (getDashboardTrends).
const AXIS = ['−23 ชม.', '−18', '−12', '−6', 'ตอนนี้'] as const;
const fmt = (n: number) => n.toLocaleString('en-US');

export function LaborVitalsSection({ summary, trends }: { summary: DashboardSummary; trends: DashboardTrends }) {
  const fresh = trends.newByRisk24h;
  const adm = laborAdmissionsHint(trends.admissionsToday, trends.admissions7dAvg);
  return (
    <SectionCard
      title="ห้องคลอดทั้งจังหวัด"
      description="ผู้คลอดที่ยังอยู่ในห้องคลอดทุกโรงพยาบาล แยกตามระดับความเสี่ยง CPD ล่าสุด"
    >
      <KpiGrid>
        <KpiTile
          testId="vital-active"
          label="ผู้คลอดในห้องคลอด"
          count={summary.totalActive}
          sub={`รับใหม่ ${fmt(fresh.total)} รายใน 24 ชม.`}
          hint={LABOR_TILE_HINTS.active}
        />
        <KpiTile
          testId="vital-high"
          label="CPD เสี่ยงสูง"
          count={summary.totalHigh}
          tone={summary.totalHigh > 0 ? 'high' : 'default'}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.high)} ราย`}
          hint={LABOR_TILE_HINTS.high}
        />
        <KpiTile
          testId="vital-medium"
          label="CPD เสี่ยงปานกลาง"
          count={summary.totalMedium}
          tone={summary.totalMedium > 0 ? 'warn' : 'default'}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.medium)} ราย`}
          hint={LABOR_TILE_HINTS.medium}
        />
        <KpiTile
          testId="vital-low"
          label="CPD เสี่ยงต่ำ"
          count={summary.totalLow}
          sub={`รับใหม่ใน 24 ชม. ${fmt(fresh.low)} ราย`}
          hint={LABOR_TILE_HINTS.low}
        />
      </KpiGrid>

      <div className="mt-4">
        <RiskBar low={summary.totalLow} medium={summary.totalMedium} high={summary.totalHigh} height={8} />
        <p data-testid="risk-legend" className="mt-1.5 text-label text-ink-muted">
          <span className="text-ok-text">เสี่ยงต่ำ {fmt(summary.totalLow)}</span> ·{' '}
          <span className="text-warn-text">ปานกลาง {fmt(summary.totalMedium)}</span> ·{' '}
          <span className="text-danger-text">สูง {fmt(summary.totalHigh)}</span>
        </p>
      </div>

      <div data-testid="admissions-24h" className="mt-5 border-t border-border pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="flex items-center gap-1.5 text-body-lg text-ink">
            รับเข้าห้องคลอดรายชั่วโมง (24 ชม.ล่าสุด)
            <HintButton label="รับเข้าห้องคลอดรายชั่วโมง" title={adm.title} body={adm.body} className="text-ink-muted" />
          </h3>
          <p className="text-label text-ink-muted">
            วันนี้ <b className="tabular-nums text-ink">{fmt(trends.admissionsToday)}</b> ราย · เฉลี่ย 7 วัน{' '}
            <b className="tabular-nums text-ink">{trends.admissions7dAvg.toFixed(1)}</b> ราย/วัน
          </p>
        </div>
        <div className="mt-2">
          <BarStrip
            values={trends.admissions24h}
            width={480}
            height={40}
            color="var(--brand)"
            fluid
            label="จำนวนรับเข้ารายชั่วโมง 24 ชั่วโมงล่าสุด"
          />
          <div className="mt-1 flex justify-between text-caption text-ink-muted">
            {AXIS.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
