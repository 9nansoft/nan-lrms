// Task 24: WardLayoutView — room-grouped grid of BedTiles for the hospital
// maternity ward. Static layout only; DnD wiring lands in Task 52.
'use client';

import { BedTile } from './BedTile';
import type { BedSlot, BedOccupancy } from '@/types/maternity-ward';

export interface WardLayoutViewProps {
  beds: BedSlot[];
  occupancy: BedOccupancy[];
  onBedClick?: (an: string) => void;
}

interface RoomGroup {
  roomno: string;
  room_name: string | null;
  room_display_number: number | null;
  beds: BedSlot[];
}

function groupByRoom(beds: BedSlot[]): RoomGroup[] {
  const map = new Map<string, RoomGroup>();
  for (const b of beds) {
    let g = map.get(b.roomno);
    if (!g) {
      g = {
        roomno: b.roomno,
        room_name: b.room_name,
        room_display_number: b.room_display_number,
        beds: [],
      };
      map.set(b.roomno, g);
    }
    g.beds.push(b);
  }
  // Sort beds within each room by bed_order asc, then bedno lexical
  for (const g of map.values()) {
    g.beds.sort((a, b) => {
      const ao = a.bed_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.bed_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.bedno.localeCompare(b.bedno);
    });
  }
  // Sort rooms by room_display_number asc, then roomno lexical
  return [...map.values()].sort((a, b) => {
    const ad = a.room_display_number ?? Number.MAX_SAFE_INTEGER;
    const bd = b.room_display_number ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.roomno.localeCompare(b.roomno);
  });
}

export function WardLayoutView({ beds, occupancy, onBedClick }: WardLayoutViewProps) {
  const rooms = groupByRoom(beds);
  const occupantByBedno = new Map(occupancy.map((o) => [o.bedno, o] as const));

  return (
    <div className="space-y-6">
      {rooms.map((room) => (
        <section
          key={room.roomno}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <header className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              {room.room_name ?? `ห้อง ${room.roomno}`}
            </h2>
            <span className="text-xs text-slate-500">{room.beds.length} เตียง</span>
          </header>
          <div className="flex flex-wrap gap-3">
            {room.beds.map((b) => (
              <BedTile
                key={b.bedno}
                bedno={b.bedno}
                bedLock={b.bed_lock as 'Y' | 'N' | null}
                occupant={occupantByBedno.get(b.bedno) ?? null}
                onClick={onBedClick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
