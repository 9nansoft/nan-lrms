// WardLayoutViewFull — clinical-density variant of WardLayoutView.
//
// Same room-grouped layout as the lite view PLUS @dnd-kit drag-and-drop bed
// move (port from WardLayoutView). The dense BedTileFull is wrapped in the
// same DraggableBedTile shell, so the decision logic in decideBedMoveAction
// drives both the lite and full views — no behavioural drift.
//
// `BedOccupancyFull extends BedOccupancy` so the existing
// decideBedMoveAction signature accepts our richer occupant rows directly;
// no generic plumbing required.
'use client';

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';

import { BedTileFull } from './BedTileFull';
import { decideBedMoveAction, type BedMoveDecision } from './decideBedMoveAction';
import { BedMoveReasonModal } from './BedMoveReasonModal';
import type { BedSlot, BedOccupancyFull } from '@/types/maternity-ward';
import type { ConnectionConfig } from '@/types/bms-browser';
import type { MaternalScreenSummaryItem } from '@/types/api';
import { UNPLACED_SECTION, formatRoomSummary, sharedBedNotice, unplacedBedLabel } from '@/config/ward-display';
import {
  groupBedsByRoom,
  placeOccupants,
  summarizeBeds,
  type UnplacedOccupant,
} from '@/services/ward-board';
import { cn } from '@/lib/utils';

export interface BedMovePayload {
  an: string;
  oldBedno: string;
  oldRoomno: string;
  newBedno: string;
  newRoomno: string;
  reason: string;
}

export interface WardLayoutViewFullProps {
  beds: BedSlot[];
  occupancy: BedOccupancyFull[];
  /** Live "now" tick (ms since epoch) — drives hours-since-admit + severity.
   *  Required so BedTileFull stays render-pure (no internal Date.now()). */
  now: number;
  onBedClick?: (an: string) => void;
  /**
   * Called once the user has confirmed a bed move via the reason modal. The
   * caller (the page) is responsible for invoking the movePatientBed service
   * and revalidating SWR caches.
   */
  onBedMove?: (payload: BedMovePayload) => void;
  /**
   * Resolved list of move-reason strings (from getBedMoveReasons). Passed in
   * by the page so this component stays presentational. Empty array disables
   * the modal Confirm button.
   */
  reasons?: string[];
  /**
   * Called when a drag-end is rejected (locked/occupied/no-op) so the page
   * can surface a Thai-language toast. Defaults to console.warn when unset.
   */
  onMoveRejected?: (reason: 'locked' | 'occupied' | 'no-op') => void;
  /** Active BMS connection — forwarded to each tile to enable patient photos. */
  config?: ConnectionConfig | null;
  marketplaceToken?: string | null;
  /**
   * Cross-source maternal-screen summaries, keyed by AN (Phase 6 Task H4,
   * GC-H4). Looked up HERE (at the layout level, by `occupant.an`) rather
   * than passed whole into DraggableBedTile — that keeps DraggableBedTile's
   * change to a single passthrough prop (a resolved item, not a Map) and
   * keeps BedTileFull's contract simple (one summary object, not a lookup).
   * `undefined`/`null` (fetch not started, or failed) means every tile
   * resolves to `null` — GC-H4 degrade-to-no-chips, never an error tile.
   */
  maternalScreenSummaries?: Map<string, MaternalScreenSummaryItem> | null;
}

// Drag-id encoding — bednos are unique per ward in HOSxP (PK on `bedno`).
function dragId(bed: BedSlot): string {
  return `bed:${bed.bedno}`;
}

interface DraggableBedTileProps {
  bed: BedSlot;
  /** Everyone HOSxP has on this bed — more than one is a data conflict (I2). */
  occupants: BedOccupancyFull[];
  now: number;
  onBedClick?: (an: string) => void;
  config?: ConnectionConfig | null;
  marketplaceToken?: string | null;
  /** Lookup by occupant.an — see maternalScreenSummaries above. */
  maternalScreenSummaries?: Map<string, MaternalScreenSummaryItem> | null;
}

// Per-bed wrapper that enrols the tile as both droppable (always) and
// draggable (only with exactly one occupant). Empty/locked tiles still need to
// be droppable so a patient can be dropped onto them; locked drops are
// rejected in the dispatcher. A shared bed is not draggable: which admission
// would move is ambiguous, so the nurse fixes it in HOSxP.
function DraggableBedTile({
  bed,
  occupants,
  now,
  onBedClick,
  config,
  marketplaceToken,
  maternalScreenSummaries,
}: DraggableBedTileProps) {
  const id = dragId(bed);
  const shared = occupants.length > 1;
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id });
  const draggable = useDraggable({
    id,
    disabled: occupants.length !== 1,
  });
  // Compose drop ref + drag ref onto the same wrapper.
  const composedRef = (node: HTMLDivElement | null) => {
    setDropRef(node);
    draggable.setNodeRef(node);
  };
  const style: React.CSSProperties | undefined = draggable.transform
    ? {
        transform: `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`,
      }
    : undefined;
  return (
    <div
      ref={composedRef}
      style={style}
      data-testid={`bed-slot-${bed.bedno}`}
      data-over={isOver ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-2',
        // A vacant/locked card keeps its own short height (and drop ring)
        // rather than stretching to the occupied tiles in its grid row.
        occupants.length === 0 && 'self-start',
        isOver && 'rounded-2xl ring-2 ring-brand ring-offset-2',
      )}
      {...(occupants.length === 1 ? draggable.listeners : {})}
      {...draggable.attributes}
    >
      {shared && (
        <p
          role="status"
          data-testid={`bed-conflict-${bed.bedno}`}
          className="rounded-lg border border-danger/40 bg-danger-tint px-3 py-2 text-label font-semibold text-danger-text"
        >
          {sharedBedNotice(bed.bedno, occupants.length)}
        </p>
      )}
      {(occupants.length > 0 ? occupants : [null]).map((o, i) => (
        <BedTileFull
          key={o?.an ?? 'vacant'}
          bedno={bed.bedno}
          testId={i === 0 ? `bed-${bed.bedno}` : `bed-${bed.bedno}-${i + 1}`}
          bedLock={bed.bed_lock as 'Y' | 'N' | null}
          occupant={o}
          now={now}
          onClick={onBedClick}
          config={config}
          marketplaceToken={marketplaceToken}
          maternalScreenSummary={o ? (maternalScreenSummaries?.get(o.an) ?? null) : null}
        />
      ))}
    </div>
  );
}

/** I2: admitted patients with a blank bed or a bed outside this layout. */
function UnplacedSection({
  unplaced,
  now,
  onBedClick,
  config,
  marketplaceToken,
  maternalScreenSummaries,
}: {
  unplaced: UnplacedOccupant[];
  now: number;
  onBedClick?: (an: string) => void;
  config?: ConnectionConfig | null;
  marketplaceToken?: string | null;
  maternalScreenSummaries?: Map<string, MaternalScreenSummaryItem> | null;
}) {
  if (unplaced.length === 0) return null;
  return (
    <section data-testid="ward-unplaced" aria-label={UNPLACED_SECTION.title}>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-danger/40 pb-2">
        <h2 className="text-title text-danger-text">{UNPLACED_SECTION.title}</h2>
        <p className="text-label text-ink-muted">{UNPLACED_SECTION.summary(unplaced.length)}</p>
      </header>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
        {unplaced.map(({ occupant, reason }, i) => (
          <BedTileFull
            key={occupant.an}
            bedno={occupant.bedno ?? ''}
            bedLabel={unplacedBedLabel({ reason, bedno: occupant.bedno })}
            testId={`ward-unplaced-${i + 1}`}
            bedLock={null}
            occupant={occupant}
            now={now}
            onClick={onBedClick}
            config={config}
            marketplaceToken={marketplaceToken}
            maternalScreenSummary={maternalScreenSummaries?.get(occupant.an) ?? null}
          />
        ))}
      </div>
    </section>
  );
}

export function WardLayoutViewFull({
  beds,
  occupancy,
  now,
  onBedClick,
  onBedMove,
  reasons = [],
  onMoveRejected,
  config,
  marketplaceToken,
  maternalScreenSummaries,
}: WardLayoutViewFullProps) {
  const rooms = groupBedsByRoom(beds);
  const placement = placeOccupants(beds, occupancy);
  const bedByBedno = new Map(beds.map((b) => [b.bedno, b] as const));

  const [pending, setPending] = useState<{
    decision: Extract<BedMoveDecision, { action: 'show-modal' }>;
    sourceBed: BedSlot;
    targetBed: BedSlot;
  } | null>(null);

  // Distance threshold of 6px lets the BedTileFull onClick still fire for
  // simple taps; only sustained pointer movement starts a drag. Keyboard
  // sensor (Tab → Space → Arrow → Space) for accessibility.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const sourceBedno = String(event.active.id).replace(/^bed:/, '');
    const targetBedno = String(event.over.id).replace(/^bed:/, '');
    const sourceBed = bedByBedno.get(sourceBedno);
    const targetBed = bedByBedno.get(targetBedno);
    if (!sourceBed || !targetBed) return;
    // Only a single-occupant bed can be dragged (shared beds are disabled).
    const sourceList = placement.byBed.get(sourceBedno) ?? [];
    if (sourceList.length !== 1) return;
    const sourceOccupant = sourceList[0];
    const targetOccupant = placement.byBed.get(targetBedno)?.[0] ?? null;
    const decision = decideBedMoveAction({
      sourceBed,
      sourceOccupant,
      targetBed,
      targetOccupant,
    });
    if (decision.action === 'rejected') {
      if (onMoveRejected) {
        onMoveRejected(decision.reason);
      } else {
        // TODO: replace with a shared toast when the project ships one.
        console.warn(`[bed-move] rejected: ${decision.reason}`);
      }
      return;
    }
    setPending({ decision, sourceBed, targetBed });
  };

  const handleConfirm = (reason: string) => {
    if (!pending) return;
    onBedMove?.({
      an: pending.decision.an,
      oldBedno: pending.sourceBed.bedno,
      oldRoomno: pending.sourceBed.roomno,
      newBedno: pending.targetBed.bedno,
      newRoomno: pending.targetBed.roomno,
      reason,
    });
    setPending(null);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      {/* FHR pulse keyframes — single declaration shared by all tiles. */}
      <style>{`
        @keyframes kk-heartbeat {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.7); opacity: 0.4; }
        }
      `}</style>

      <div className="flex flex-col gap-6">
        {/* First, so a patient without a usable bed is the first thing seen. */}
        <UnplacedSection
          unplaced={placement.unplaced}
          now={now}
          onBedClick={onBedClick}
          config={config}
          marketplaceToken={marketplaceToken}
          maternalScreenSummaries={maternalScreenSummaries}
        />
        {rooms.map((room) => {
          // The room's own placed patients only — the ward-level summary adds
          // the unplaced ones, so rooms + unplaced = ward (one counting rule).
          const roomOccupants = room.beds.flatMap((b) => placement.byBed.get(b.bedno) ?? []);
          const sum = summarizeBeds(room.beds, roomOccupants, now);
          const roomTitle = room.room_name ?? `ห้อง ${room.roomno}`;
          return (
            <section key={room.roomno} data-testid={`ward-room-${room.roomno}`} aria-label={roomTitle}>
              <header className="mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-border pb-2">
                <div className="min-w-0">
                  <h2 className="text-title text-brand">{roomTitle}</h2>
                  <p className="text-caption text-ink-muted">รหัสห้อง {room.roomno}</p>
                </div>
                <p className="text-label tabular-nums text-ink-muted">{formatRoomSummary(sum)}</p>
              </header>
              <div data-testid="ward-room-grid" className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
                {room.beds.map((b) => (
                  <DraggableBedTile
                    key={b.bedno}
                    bed={b}
                    occupants={placement.byBed.get(b.bedno) ?? []}
                    now={now}
                    onBedClick={onBedClick}
                    config={config}
                    marketplaceToken={marketplaceToken}
                    maternalScreenSummaries={maternalScreenSummaries}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {pending && (
        <BedMoveReasonModal
          open
          reasons={reasons}
          fromBedno={pending.sourceBed.bedno}
          toBedno={pending.targetBed.bedno}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
    </DndContext>
  );
}
