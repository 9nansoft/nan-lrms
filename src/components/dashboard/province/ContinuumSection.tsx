// ฝากครรภ์และการส่งต่อ — the same headline numbers the pregnancies and
// referrals boards show (getAncBoardCounts / getReferralOpsCounts), each a
// link into its board.
'use client';

import type { DashboardContinuum } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { ANC_REGISTRY_CRITERIA_TH, ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import { ANC_OPS } from '@/config/anc-ops';

export function ContinuumSection({ continuum }: { continuum: DashboardContinuum }) {
  const { anc, referrals } = continuum;
  return (
    <SectionCard title="ฝากครรภ์และการส่งต่อ" description="ตัวเลขเดียวกับหน้าฝากครรภ์และหน้าส่งต่อ — กดเพื่อเปิดรายการ">
      <KpiGrid>
        <KpiTile
          testId="continuum-anc"
          label={ANC_REGISTRY_LABEL_TH}
          count={anc.total}
          href="/pregnancies"
          hint={{ title: ANC_REGISTRY_LABEL_TH, body: ANC_REGISTRY_CRITERIA_TH }}
        />
        {/* Amber, not red: red is reserved for acute intrapartum risk (same
            rule as the province map pins). */}
        <KpiTile
          testId="continuum-hr3"
          label="ครรภ์เสี่ยงสูง HR3"
          count={anc.hr3}
          tone={anc.hr3 > 0 ? 'warn' : 'default'}
          href="/pregnancies?risk=HR3"
        />
        <KpiTile
          testId="continuum-due-soon"
          label={`ใกล้คลอด ≤${ANC_OPS.dueSoonDays} วัน`}
          count={anc.dueSoon}
          tone={anc.dueSoon > 0 ? 'warn' : 'default'}
          href="/pregnancies?cohort=due_soon"
        />
        <KpiTile
          testId="continuum-referrals"
          label="ส่งต่อ 7 วันล่าสุด"
          count={referrals.last7d}
          sub={`วันนี้ ${referrals.today.toLocaleString('en-US')} ราย`}
          href="/referrals"
        />
      </KpiGrid>
    </SectionCard>
  );
}
