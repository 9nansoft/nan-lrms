'use client';

import useSWR from 'swr';
import type { JourneyLabResult } from '@/services/anc-lab-results';
import type { JourneyLabTier } from '@/services/journey-access';

const REFRESH_INTERVAL_MS = 60_000;

interface JourneyLabsResponse {
  results: JourneyLabResult[];
  tier: JourneyLabTier;
}

/** SWR's global fetcher attaches the HTTP status to the errors it throws. */
function statusOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'status' in error) {
    const { status } = error as { status: unknown };
    return typeof status === 'number' ? status : null;
  }
  return null;
}

export function useJourneyLabs(journeyId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<JourneyLabsResponse>(
    journeyId ? `/api/journeys/${journeyId}/labs` : null,
    { refreshInterval: REFRESH_INTERVAL_MS },
  );
  return {
    results: data?.results ?? null,
    tier: data?.tier ?? null,
    error: error as Error | undefined,
    isForbidden: statusOf(error) === 403,
    isLoading,
    mutate,
  };
}
