// src/hooks/useSyncFreshness.ts
'use client';
// Polls a 15s server-cached endpoint (SYNC_FRESHNESS_POLL.refreshMs). Deliberately
// no SSE here: useSSE opens one EventSource per call, and the strip is on every page.
import useSWR from 'swr';
import type { FreshnessSummary } from '@/types/sync-freshness';
import { SYNC_FRESHNESS_POLL } from '@/config/hospital-network';

/** A response plus the client time it arrived — lets the strip tell a live
 *  snapshot from one SWR is still holding after refreshes started failing. */
export type FreshnessSnapshot = FreshnessSummary & { receivedAt: number };

async function fetchFreshness(url: string): Promise<FreshnessSnapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const summary = (await res.json()) as FreshnessSummary;
  return { ...summary, receivedAt: Date.now() };
}

export function useSyncFreshness() {
  return useSWR<FreshnessSnapshot, Error>('/api/sync/freshness', fetchFreshness, {
    refreshInterval: SYNC_FRESHNESS_POLL.refreshMs,
    revalidateOnFocus: true,
  });
}
