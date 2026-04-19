// Task 52: pure-function dispatcher for the WardLayoutView drag-end handler.
// Extracted so we can unit-test the decision logic without simulating @dnd-kit
// pointer events (which jsdom does not deliver reliably). The WardLayoutView
// onDragEnd handler resolves the source/target BedSlot + occupancy lookups and
// then calls this function; the returned action drives whether to toast a
// rejection or open the BedMoveReasonModal.
import type { BedOccupancy, BedSlot } from '@/types/maternity-ward';

export interface BedMoveDecisionInput {
  sourceBed: BedSlot;
  sourceOccupant: BedOccupancy;
  targetBed: BedSlot;
  targetOccupant: BedOccupancy | null;
}

export type BedMoveDecision =
  | { action: 'rejected'; reason: 'locked' | 'occupied' | 'no-op' }
  | {
      action: 'show-modal';
      from: { bedno: string; roomno: string };
      to: { bedno: string; roomno: string };
      an: string;
    };

export function decideBedMoveAction(input: BedMoveDecisionInput): BedMoveDecision {
  const { sourceBed, sourceOccupant, targetBed, targetOccupant } = input;
  // Source equals target — no-op so we don't fire a needless audit row.
  if (sourceBed.bedno === targetBed.bedno && sourceBed.roomno === targetBed.roomno) {
    return { action: 'rejected', reason: 'no-op' };
  }
  if (targetBed.bed_lock === 'Y') {
    return { action: 'rejected', reason: 'locked' };
  }
  if (targetOccupant !== null) {
    // v1 does not support swap; reject with a Thai-language toast at the call site.
    return { action: 'rejected', reason: 'occupied' };
  }
  return {
    action: 'show-modal',
    from: { bedno: sourceBed.bedno, roomno: sourceBed.roomno },
    to: { bedno: targetBed.bedno, roomno: targetBed.roomno },
    an: sourceOccupant.an,
  };
}
