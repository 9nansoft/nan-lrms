// T075: usePatient composite SWR hook
'use client';

import useSWR from 'swr';
import type { PatientDetailResponse, VitalSignsResponse, ContractionsResponse } from '@/types/api';

export function usePatient(patientId: string | null) {
  const { data: detail, isLoading: loadingDetail, error: detailError, mutate } = useSWR<PatientDetailResponse>(
    patientId ? `/api/patients/${patientId}` : null,
    { refreshInterval: 30000 },
  );

  const { data: vitalsData, isLoading: loadingVitals } = useSWR<VitalSignsResponse>(
    patientId ? `/api/patients/${patientId}/vitals` : null,
    { refreshInterval: 30000 },
  );

  const { data: contractionsData, isLoading: loadingContractions } = useSWR<ContractionsResponse>(
    patientId ? `/api/patients/${patientId}/contractions` : null,
    { refreshInterval: 30000 },
  );

  return {
    patient: detail?.patient ?? null,
    cpdScore: detail?.cpdScore ?? null,
    // `journeyContext` is the /pregnancies journey linked to this labor
    // admission (same CID, possibly across hospitals). Present only when
    // the woman had prior ANC registration. Consumers render the ANC
    // summary panel off this; absent → labor-only admission.
    journeyContext: detail?.journeyContext ?? null,
    vitals: vitalsData?.vitals ?? [],
    contractions: contractionsData?.contractions ?? [],
    isLoading: loadingDetail || loadingVitals || loadingContractions,
    error: detailError,
    mutate,
  };
}
