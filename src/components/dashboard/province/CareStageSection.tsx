'use client';

import type { DashboardStageKPIs } from '@/types/api';
import { SectionCard } from '@/components/shared/SectionCard';
import { StageKPICards } from '@/components/dashboard/StageKPICards';

export function CareStageSection({ stageKPIs }: { stageKPIs: DashboardStageKPIs }) {
  return (
    <SectionCard title="ระยะการดูแล" description="ฝากครรภ์ → ห้องคลอด → คลอดแล้ว · กดการ์ดเพื่อเปิดหน้ารายการ">
      <StageKPICards stageKPIs={stageKPIs} />
    </SectionCard>
  );
}
