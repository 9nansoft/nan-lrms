// HOSxP → NN-LRMS browser-sync status chip. One chip for every page that runs
// useHosxpBrowserSync (`/` and /hospital-maternity-ward): same tones, same Thai
// status words, and a click opens HosxpSyncDialog for the copyable IT report.
'use client';

import { Info } from 'lucide-react';
import {
  HOSXP_SYNC_STATUS_TH,
  hosxpSyncTone,
  type HosxpSyncStatus,
  type HosxpSyncTone,
} from '@/lib/hosxp-sync-status';
import { STATUS_TONE } from '@/config/status-tone';
import { cn } from '@/lib/utils';

// Chip + dot come from STATUS_TONE; neutral keeps its card surface (not the
// muted tint) exactly as before the consolidation.
const HOSXP_CHIP: Record<HosxpSyncTone, { box: string; dot: string }> = {
  danger: { box: STATUS_TONE.danger.chip, dot: STATUS_TONE.danger.dot },
  ok: { box: STATUS_TONE.ok.chip, dot: STATUS_TONE.ok.dot },
  neutral: {
    box: `${STATUS_TONE.neutral.border} bg-surface-card ${STATUS_TONE.neutral.text}`,
    dot: STATUS_TONE.neutral.dot,
  },
};

export interface HosxpSyncChipProps {
  status: HosxpSyncStatus;
  /** Short English status line (phase · cycles) — the chip's tooltip. */
  detail: string;
  onOpen: () => void;
  /** What the page calls the pipeline; `/` says "HOSxP". */
  label?: string;
}

export function HosxpSyncChip({ status, detail, onOpen, label = 'HOSxP' }: HosxpSyncChipProps) {
  const chip = HOSXP_CHIP[hosxpSyncTone(status)];
  return (
    <button
      type="button"
      onClick={onOpen}
      title={detail}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-label',
        chip.box,
      )}
    >
      <span aria-hidden="true" className={cn('h-2.5 w-2.5 rounded-full', chip.dot)} />
      {label}: {HOSXP_SYNC_STATUS_TH[status]}
      <Info aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
