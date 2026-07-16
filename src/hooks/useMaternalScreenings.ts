// SWR hook for a single patient's maternal labor-triage screening history
// (Task 8 read API). Modeled on src/hooks/useHighRiskPatients.ts. SEPARATE
// hook — per GC-U4, deliberately NOT folded into the `usePatient` composite
// (that would block first paint on this provisional, flag-gated feature).
'use client';

import useSWR from 'swr';
import type { MaternalScreenAssessmentsResponse } from '@/types/api';

export function useMaternalScreenings(patientId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<MaternalScreenAssessmentsResponse>(
    patientId ? `/api/patients/${patientId}/maternal-screenings` : null,
    { refreshInterval: 30000 },
  );

  return {
    uiEnabled: data?.uiEnabled ?? false,
    latest: data?.latest ?? null,
    history: data?.history ?? [],
    nextCursor: data?.nextCursor ?? null,
    isLoading,
    error,
    mutate,
  };
}
