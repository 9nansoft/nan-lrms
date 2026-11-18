// SWR hook — cached maternity assessment forms of one admission.
'use client';

import useSWR from 'swr';
import type { MaternityAssessmentsResponse } from '@/types/maternity-assessments';

export function useMaternityAssessments(patientId: string | null) {
  const { data, isLoading, error, mutate } = useSWR<MaternityAssessmentsResponse>(
    patientId ? `/api/patients/${patientId}/assessments` : null,
    { refreshInterval: 30000 },
  );

  return {
    assessments: data?.assessments ?? [],
    isLoading,
    error,
    mutate,
  };
}
