// PageHeader actions for `/`: live-update status, HOSxP sync status (opens
// the diagnostics dialog), manual sync with progress, kiosk.
'use client';

import { Monitor, RefreshCw } from 'lucide-react';
import type { SseConnectionState } from '@/hooks/useSSE';
import { SSE_STATUS_META } from '@/config/sse-status';
import { StatusChip } from '@/components/shared/StatusChip';
import { HosxpSyncChip } from '@/components/shared/HosxpSyncChip';
import type { HosxpSyncStatus } from '@/lib/hosxp-sync-status';
import { cn } from '@/lib/utils';

export interface DashboardHeaderActionsProps {
  sseState: SseConnectionState;
  hosxpStatus: HosxpSyncStatus;
  hosxpDetail: string;
  onOpenHosxp: () => void;
  syncing: boolean;
  onSync: () => void;
  onKiosk: () => void;
}

export function DashboardHeaderActions({
  sseState,
  hosxpStatus,
  hosxpDetail,
  onOpenHosxp,
  syncing,
  onSync,
  onKiosk,
}: DashboardHeaderActionsProps) {
  const sse = SSE_STATUS_META[sseState];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <StatusChip tone={sse.tone} label={sse.labelTh} />
      <HosxpSyncChip status={hosxpStatus} detail={hosxpDetail} onOpen={onOpenHosxp} />
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 py-1.5 text-label text-ink transition-colors hover:bg-brand-soft disabled:opacity-60"
      >
        <RefreshCw aria-hidden="true" className={cn('h-4 w-4', syncing && 'animate-spin')} />
        {syncing ? 'กำลังดึงข้อมูล…' : 'ดึงข้อมูลทันที'}
      </button>
      <button
        type="button"
        onClick={onKiosk}
        title="เปิดโหมดจอภาพ (Kiosk Mode)"
        className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-label text-white transition-colors hover:bg-brand-strong"
      >
        <Monitor aria-hidden="true" className="h-4 w-4" />
        โหมดจอภาพ
      </button>
    </div>
  );
}
