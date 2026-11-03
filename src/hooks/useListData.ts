// src/hooks/useListData.ts
// SWR for list pages: refresh interval + keepPreviousData (paging/filtering
// swaps the key but must not flash the full-page loader), plus the client
// time of the last successful fetch for the page-data freshness badge.
'use client';
import { useState } from 'react';
import useSWR from 'swr';

export function useListData<T>(key: string | null, refreshMs: number) {
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const swr = useSWR<T>(key, {
    refreshInterval: refreshMs,
    keepPreviousData: true,
    onSuccess: () => setLastUpdatedAt(new Date().toISOString()),
  });
  return { data: swr.data, error: swr.error, isLoading: swr.isLoading, mutate: swr.mutate, lastUpdatedAt };
}
