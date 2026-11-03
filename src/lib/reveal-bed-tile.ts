// src/lib/reveal-bed-tile.ts
// "ดูเตียง →" on the ward summary: bring the first bed tile of a labour stage
// into view and give it keyboard focus. Tiles carry data-stage (BedTileFull),
// in the bed grid and in the unplaced section alike; DOM order puts the
// unplaced section first, matching what the nurse sees first.
import type { LabourStageKind } from '@/services/ward-board';
import { preferredScrollBehavior } from '@/lib/scroll-preview';

export function revealFirstBedTile(stage: LabourStageKind, root: ParentNode = document): HTMLElement | null {
  const tile = root.querySelector<HTMLElement>(`article[data-stage="${stage}"]`);
  if (!tile) return null;
  tile.scrollIntoView?.({ behavior: preferredScrollBehavior(), block: 'center' });
  tile.focus({ preventScroll: true });
  return tile;
}
