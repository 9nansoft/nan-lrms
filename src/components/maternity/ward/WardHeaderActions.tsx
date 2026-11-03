// src/components/maternity/ward/WardHeaderActions.tsx
// PageHeader actions for the ward board: ward picker (only with more than one
// maternity ward), live HOSxP feed status with the ward's own last-update
// time (the page's single freshness indicator), the HOSxP → NN-LRMS sync
// status (same chip as `/`), and a manual refresh that also runs a sync cycle.
'use client';

import { RefreshCw } from 'lucide-react';
import type { MaternityWard } from '@/types/maternity-ward';
import type { WardFeedHealth } from '@/hooks/useMaternityWardStateFull';
import type { HosxpSyncStatus } from '@/lib/hosxp-sync-status';
import { WARD_FEED_STATUS, WARD_SYNC_CHIP_LABEL, wardFeedChipDetail, wardFeedChipLabel } from '@/config/ward-display';
import { StatusChip } from '@/components/shared/StatusChip';
import { HosxpSyncChip } from '@/components/shared/HosxpSyncChip';
import { cn } from '@/lib/utils';

export interface WardHeaderActionsProps {
  wards: MaternityWard[];
  selectedWard: string | null;
  onSelectWard: (ward: string) => void;
  health: WardFeedHealth;
  /** ISO time of the ward's last successful occupancy fetch; null until loaded. */
  lastUpdatedAt?: string | null;
  /** Raw feed error; shown as the chip tooltip while the feed is unhealthy. */
  errorMessage?: string;
  /** HOSxP → NN-LRMS browser sync (useHosxpBrowserSync). */
  hosxpStatus: HosxpSyncStatus;
  hosxpDetail: string;
  onOpenHosxp: () => void;
  /** A sync cycle is in flight — the refresh icon spins. */
  syncing: boolean;
  onRefresh: () => void;
}

export function WardHeaderActions({
  wards,
  selectedWard,
  onSelectWard,
  health,
  lastUpdatedAt = null,
  errorMessage,
  hosxpStatus,
  hosxpDetail,
  onOpenHosxp,
  syncing,
  onRefresh,
}: WardHeaderActionsProps) {
  const feed = WARD_FEED_STATUS[health];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {wards.length > 1 && (
        <label className="inline-flex items-center gap-2 text-label text-ink-muted">
          วอร์ด
          <select
            value={selectedWard ?? ''}
            onChange={(e) => onSelectWard(e.target.value)}
            className="h-10 rounded-lg border border-border bg-surface-card px-3 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {wards.map((w) => (
              <option key={w.ward} value={w.ward}>
                {w.name} ({w.ward})
              </option>
            ))}
          </select>
        </label>
      )}
      <StatusChip
        tone={feed.tone}
        label={wardFeedChipLabel(health)}
        detail={wardFeedChipDetail(lastUpdatedAt)}
        pulse={feed.pulse}
        title={health === 'ok' ? undefined : errorMessage}
      />
      <HosxpSyncChip label={WARD_SYNC_CHIP_LABEL} status={hosxpStatus} detail={hosxpDetail} onOpen={onOpenHosxp} />
      {/* Never disabled while syncing: the board refetch does not wait on the
          sync cycle, and a second sync request is a no-op (ref-guarded). */}
      <button
        type="button"
        onClick={onRefresh}
        aria-label="รีเฟรชข้อมูลเตียง"
        aria-busy={syncing}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-label text-white hover:bg-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', syncing && 'animate-spin')} />
        รีเฟรช
      </button>
    </div>
  );
}
