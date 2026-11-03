// src/config/sync-run-status.ts
// One vocabulary for HOSxP sync runs: the admin Sync Overview table and the
// hospital dialog's Sync Log both read it (they used to define the same
// badge palette twice, with raw blue/slate hex for running/never).
import type { StatusTone } from '@/config/status-tone';

export type SyncRunOutcome = 'running' | 'success' | 'partial' | 'failed';
export type SyncOverviewOutcome = SyncRunOutcome | 'never';
export type SyncStepStatus = 'running' | 'success' | 'warning' | 'error' | 'info';
export type SyncTrigger = 'scheduled' | 'immediate' | 'onboarding';

export const SYNC_OUTCOME_META: Record<SyncOverviewOutcome, { labelTh: string; tone: StatusTone }> = {
  success: { labelTh: 'สำเร็จ', tone: 'ok' },
  partial: { labelTh: 'สำเร็จบางส่วน', tone: 'warn' },
  failed: { labelTh: 'ล้มเหลว', tone: 'danger' },
  running: { labelTh: 'กำลังซิงค์', tone: 'brand' },
  never: { labelTh: 'ยังไม่เคยซิงค์', tone: 'neutral' },
};

export const SYNC_STEP_TONE: Record<SyncStepStatus, StatusTone> = {
  success: 'ok', warning: 'warn', error: 'danger', info: 'neutral', running: 'brand',
};

export const SYNC_TRIGGER_TH: Record<SyncTrigger, string> = {
  scheduled: 'ตามรอบ', immediate: 'สั่งทันที', onboarding: 'เริ่มใช้งาน',
};

export function syncTriggerLabel(trigger: string | null | undefined): string {
  if (!trigger) return '—';
  return trigger in SYNC_TRIGGER_TH ? SYNC_TRIGGER_TH[trigger as SyncTrigger] : trigger;
}

export function formatSyncDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} มิลลิวินาที`;
  return `${(ms / 1000).toFixed(1)} วินาที`;
}

/** /api/admin/sync-overview refresh — quoted in the tab's copy. */
export const SYNC_OVERVIEW_POLL_MS = 15_000;

/** Per-hospital sync log refresh in the edit dialog — quoted in its copy. */
export const SYNC_LOG_POLL_MS = 10_000;
