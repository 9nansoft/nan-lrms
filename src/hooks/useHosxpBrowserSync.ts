// The one HOSxP → NN-LRMS sync pipeline for every page a hospital can land on.
//
// Production runs browser-only sync (server-side polling is disabled): data
// reaches the central cache only while a signed-in tab runs this hook. Some
// hospitals open /hospital-maternity-ward straight from HOSxP and never visit
// `/`, so both pages mount this same hook — same onboarding, same poll
// cadence and skip gates, same status rules — instead of wiring the pieces
// separately and drifting apart.
'use client';

import { useBrowserPoll } from '@/hooks/useBrowserPoll';
import { useOnboardHosxpSync } from '@/hooks/useOnboardHosxpSync';
import { useOnboardHosxpWebhook } from '@/hooks/useOnboardHosxpWebhook';
import {
  deriveHosxpSyncStatus,
  describeHosxpSyncDetail,
  describeHosxpSyncHelp,
} from '@/lib/hosxp-sync-status';

export function useHosxpBrowserSync() {
  // Auto-provisions HOSxP's webhook_setting row on first onboarding; no-op
  // without a BMS session / marketplace_token.
  const { state: onboardingState } = useOnboardHosxpWebhook();
  const { state: hosxpSyncState } = useOnboardHosxpSync();
  // Every 60s while the tab is open; its SSE fan-out refreshes everyone else.
  const { state: pollState, runNow } = useBrowserPoll();

  const hosxpStatus = deriveHosxpSyncStatus(hosxpSyncState);

  return {
    hosxpSyncState,
    hosxpStatus,
    hosxpDetail: describeHosxpSyncDetail(hosxpSyncState, hosxpStatus),
    hosxpHelp: describeHosxpSyncHelp(hosxpSyncState, hosxpStatus),
    onboardingError: onboardingState?.error ?? null,
    syncing: pollState.isRunning,
    /** Run one poll cycle now; ref-guarded, so it is a no-op while one is in flight. */
    syncNow: runNow,
  };
}

export type HosxpBrowserSync = ReturnType<typeof useHosxpBrowserSync>;
