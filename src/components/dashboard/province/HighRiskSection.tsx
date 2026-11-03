// ผู้คลอดเสี่ยงสูงและในห้องคลอด — the province roster in a SectionCard. The
// header counts are server aggregates (summary.totalActive / totalHigh); the
// patients array is row-limited and never used for a count.
'use client';

import { SectionCard } from '@/components/shared/SectionCard';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import type { HighRiskPatient } from '@/types/api';

export interface HighRiskSectionProps {
  patients: HighRiskPatient[];
  isLoading: boolean;
  totalActive: number;
  totalHigh: number;
  ancFallback: { hr3: number; dueSoon: number } | null;
}

export function HighRiskSection({ patients, isLoading, totalActive, totalHigh, ancFallback }: HighRiskSectionProps) {
  return (
    <SectionCard
      title="ผู้คลอดเสี่ยงสูงและในห้องคลอด"
      description={`เรียงตามคะแนน CPD จากสูงไปต่ำ · ในห้องคลอดทั้งจังหวัด ${totalActive.toLocaleString('en-US')} ราย`}
    >
      <HighRiskPatientList
        embedded
        patients={patients}
        isLoading={isLoading}
        ancFallback={ancFallback}
        totalActive={totalActive}
        totalHigh={totalHigh}
      />
    </SectionCard>
  );
}
