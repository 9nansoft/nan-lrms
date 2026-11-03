// src/services/ward-board.ts
// Ward-board rules. This module is the one source for the KPI masthead, the
// room headers and the bed tiles (constitution IV), so they cannot disagree.
// Pure: `now` is always passed in, keeping the board render-pure.
//
// The values are the ones the board has always used. Any clinical change
// needs the clinical owner's sign-off, not a UI edit.
import type { BedOccupancyFull, BedSlot } from '@/types/maternity-ward';
import { isNewbornAdmitType } from '@/config/hosxp-admit-types';

/**
 * Split the ward's HOSxP admissions into the patients this board counts and
 * newborns (admit type แรกเกิด) that staff placed on a labour-ward bed. A baby
 * is not a labouring patient: counting her inflated every KPI and turned the
 * mother's bed into a shared-bed conflict. Newborns are returned, not dropped,
 * so the board can tell staff to fix the bed in HOSxP. Only a positive newborn
 * marker removes a row — an adult with no admit type recorded stays a patient.
 */
export function splitWardOccupants<T extends Pick<BedOccupancyFull, 'ipt_admit_type_id'>>(
  rows: T[],
): { patients: T[]; newborns: T[] } {
  const patients: T[] = [];
  const newborns: T[] = [];
  for (const r of rows) (isNewbornAdmitType(r.ipt_admit_type_id) ? newborns : patients).push(r);
  return { patients, newborns };
}

/** Prolonged latent phase on the board: admitted at least `minHours` ago
 *  with the cervix still below `cervixBelowCm` cm, or never recorded. */
export const PROLONGED_LATENT_RULE = { minHours: 12, cervixBelowCm: 4 } as const;

/** Cervix (cm) at which the tile reads active, then transition. */
export const LABOUR_STAGE_CM = { activeFrom: 4, transitionFrom: 7 } as const;

export type LabourStageKind = 'prolongedLatent' | 'transition' | 'active' | 'latent';

type AdmitTime = Pick<BedOccupancyFull, 'regdate' | 'regtime'>;

/** Hours since admission. HOSxP's local date + time are parsed as local
 *  time; an unparseable date counts as 0 h, which never triggers an alarm. */
export function hoursSinceAdmit(o: AdmitTime, now: number): number {
  const ts = Date.parse(`${o.regdate}T${o.regtime ?? '00:00:00'}`);
  return Number.isFinite(ts) ? (now - ts) / 3_600_000 : 0;
}

export function classifyLabourStage(
  o: AdmitTime & Pick<BedOccupancyFull, 'last_cervix_cm'>,
  now: number,
): LabourStageKind {
  const cx = o.last_cervix_cm;
  if (
    hoursSinceAdmit(o, now) >= PROLONGED_LATENT_RULE.minHours &&
    (cx === null || cx < PROLONGED_LATENT_RULE.cervixBelowCm)
  ) {
    return 'prolongedLatent';
  }
  if (cx !== null && cx >= LABOUR_STAGE_CM.transitionFrom) return 'transition';
  if (cx !== null && cx >= LABOUR_STAGE_CM.activeFrom) return 'active';
  return 'latent';
}

export interface RoomGroup {
  roomno: string;
  room_name: string | null;
  room_display_number: number | null;
  beds: BedSlot[];
}

/** Rooms by display number then roomno; beds by bed_order (nulls last) then bedno. */
export function groupBedsByRoom(beds: BedSlot[]): RoomGroup[] {
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
  for (const g of map.values()) {
    g.beds.sort((a, b) => {
      const ao = a.bed_order ?? Number.MAX_SAFE_INTEGER;
      const bo = b.bed_order ?? Number.MAX_SAFE_INTEGER;
      if (ao !== bo) return ao - bo;
      return a.bedno.localeCompare(b.bedno);
    });
  }
  return [...map.values()].sort((a, b) => {
    const ad = a.room_display_number ?? Number.MAX_SAFE_INTEGER;
    const bd = b.room_display_number ?? Number.MAX_SAFE_INTEGER;
    if (ad !== bd) return ad - bd;
    return a.roomno.localeCompare(b.roomno);
  });
}

export type UnplacedReason = 'noBed' | 'notInLayout';

export interface UnplacedOccupant {
  occupant: BedOccupancyFull;
  /** 'noBed' = iptadm.bedno blank; 'notInLayout' = a bedno that is not a bed in this layout. */
  reason: UnplacedReason;
}

export interface OccupantPlacement {
  /** Occupants per bed in the layout, in roster order. A shared bed holds them all. */
  byBed: Map<string, BedOccupancyFull[]>;
  /** Admitted patients with no usable bed in this layout. Never dropped (I2). */
  unplaced: UnplacedOccupant[];
}

function hasBedno(o: BedOccupancyFull): boolean {
  return typeof o.bedno === 'string' && o.bedno.trim() !== '';
}

function recordedLabourFields(o: BedOccupancyFull): number {
  return Object.entries(o).filter(
    ([k, v]) => k.startsWith('last_') && v !== null && v !== undefined,
  ).length;
}

/** One row per AN. The occupancy SQL LEFT-JOINs ipt_labour/ipt_pregnancy and
 *  can return an AN twice; keep the row carrying the most recorded labour
 *  data (ties keep the first). Rows without an AN are never merged. Order is
 *  the first appearance of each AN. */
export function dedupeOccupantsByAn(occupancy: BedOccupancyFull[]): BedOccupancyFull[] {
  const out: BedOccupancyFull[] = [];
  const index = new Map<string, number>();
  for (const o of occupancy) {
    const an = typeof o.an === 'string' ? o.an.trim() : '';
    if (an === '') {
      out.push(o);
      continue;
    }
    const at = index.get(an);
    if (at === undefined) {
      index.set(an, out.length);
      out.push(o);
    } else if (recordedLabourFields(o) > recordedLabourFields(out[at])) {
      out[at] = o;
    }
  }
  return out;
}

/** The row the board shows for an AN (after dedupe), so the detail panel
 *  never shows a sparser duplicate than the tile the nurse clicked. */
export function findOccupantByAn(
  occupancy: BedOccupancyFull[],
  an: string | null | undefined,
): BedOccupancyFull | null {
  const wanted = typeof an === 'string' ? an.trim() : '';
  if (wanted === '') return null;
  return (
    dedupeOccupantsByAn(occupancy).find(
      (o) => typeof o.an === 'string' && o.an.trim() === wanted,
    ) ?? null
  );
}

/** Puts every occupant somewhere: on its bed, or in `unplaced` with the reason.
 *  Bed numbers are matched trimmed; `byBed` stays keyed by the layout's own bedno. */
export function placeOccupants(beds: BedSlot[], occupancy: BedOccupancyFull[]): OccupantPlacement {
  const layoutKey = new Map<string, string>();
  for (const b of beds) {
    const t = b.bedno.trim();
    if (!layoutKey.has(t)) layoutKey.set(t, b.bedno);
  }
  const byBed = new Map<string, BedOccupancyFull[]>();
  const unplaced: UnplacedOccupant[] = [];
  for (const o of dedupeOccupantsByAn(occupancy)) {
    if (!hasBedno(o)) {
      unplaced.push({ occupant: o, reason: 'noBed' });
      continue;
    }
    const key = layoutKey.get(o.bedno.trim());
    if (key === undefined) {
      unplaced.push({ occupant: o, reason: 'notInLayout' });
    } else {
      const list = byBed.get(key);
      if (list) list.push(o);
      else byBed.set(key, [o]);
    }
  }
  return { byBed, unplaced };
}

export interface BedSummary {
  totalBeds: number;
  /** Distinct beds holding at least one patient, locked beds included (B1). Never above totalBeds. */
  occupied: number;
  /** Every patient passed in: on a bed of this list plus `unplaced` (I2). */
  patients: number;
  /** Patients whose bed is blank or not in this bed list (I2). */
  unplaced: number;
  /** Beds holding more than one admitted patient (a HOSxP data conflict). */
  sharedBeds: number;
  free: number;
  /** Locked beds with nobody in them. */
  lockedEmpty: number;
  /** Locked beds that still hold a patient (B1). They are shown and counted as occupied. */
  lockedOccupied: number;
  /** Prolonged-latent patients among all `patients`, unplaced included. */
  prolongedLatent: number;
  /** Rounded % of beds occupied; null for a ward with no beds. */
  occupancyPct: number | null;
}

/**
 * The one counting rule for a ward or a room (B1, I2). Every occupant passed
 * in counts as a patient — on its bed, or unplaced; nobody is dropped. A bed
 * counts once however many patients HOSxP puts on it, so occupied never
 * exceeds totalBeds. A locked bed with a patient is occupied, never locked or
 * free; free = total − occupied − lockedEmpty (never below 0).
 * For a room, pass only that room's placed occupants (placeOccupants().byBed).
 */
export function summarizeBeds(
  beds: BedSlot[],
  occupancy: BedOccupancyFull[],
  now: number,
): BedSummary {
  const patientsList = dedupeOccupantsByAn(occupancy);
  const { byBed, unplaced } = placeOccupants(beds, patientsList);
  const locked = beds.filter((b) => b.bed_lock === 'Y');
  const lockedEmpty = locked.filter((b) => !byBed.has(b.bedno)).length;
  const totalBeds = beds.length;
  const occupied = byBed.size;
  return {
    totalBeds,
    occupied,
    patients: patientsList.length,
    unplaced: unplaced.length,
    sharedBeds: [...byBed.values()].filter((list) => list.length > 1).length,
    free: Math.max(0, totalBeds - occupied - lockedEmpty),
    lockedEmpty,
    lockedOccupied: locked.length - lockedEmpty,
    prolongedLatent: patientsList.filter((o) => classifyLabourStage(o, now) === 'prolongedLatent')
      .length,
    occupancyPct: totalBeds > 0 ? Math.round((occupied / totalBeds) * 100) : null,
  };
}
