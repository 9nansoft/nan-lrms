// Task 52: pure-function dispatcher for the drag-end handler. We extract the
// decision logic so we can unit-test it directly without simulating @dnd-kit
// pointer events in jsdom (which doesn't fire them reliably).
import { describe, it, expect } from 'vitest';
import { decideBedMoveAction } from '@/components/maternity/decideBedMoveAction';
import type { BedSlot, BedOccupancy } from '@/types/maternity-ward';

const empty: BedSlot = {
  bedno: '02',
  roomno: 'LR1',
  bed_order: 2,
  bed_lock: 'N',
  bed_status_type_id: 1,
  room_name: 'LR1',
  room_display_number: 1,
};
const locked: BedSlot = { ...empty, bedno: '03', bed_lock: 'Y' };
const occupied: BedSlot = { ...empty, bedno: '04' };

const occupant: BedOccupancy = {
  an: 'AN1',
  hn: 'HN1',
  regdate: '2026-04-19',
  regtime: '10:00:00',
  ward: '03',
  bedno: '04',
  roomno: 'LR1',
  bedtype: null,
  roomname: 'LR1',
  pname: 'นาง',
  fname: 'ทดสอบ',
  lname: 'ระบบ',
  birthday: '1996-04-19',
  gravida: 2,
  ga: 38,
  incharge_doctor_name: 'ดร.X',
  last_observation_at: null,
  last_cervix_cm: 4,
};

describe('decideBedMoveAction', () => {
  it('returns rejected/locked when target bed has bed_lock=Y', () => {
    const r = decideBedMoveAction({
      sourceBed: occupied,
      sourceOccupant: occupant,
      targetBed: locked,
      targetOccupant: null,
    });
    expect(r).toEqual({ action: 'rejected', reason: 'locked' });
  });

  it('returns rejected/occupied when target bed has an occupant', () => {
    const otherOccupant: BedOccupancy = { ...occupant, an: 'AN2', bedno: '02' };
    const r = decideBedMoveAction({
      sourceBed: occupied,
      sourceOccupant: occupant,
      targetBed: empty, // bedno '02'
      targetOccupant: otherOccupant,
    });
    expect(r).toEqual({ action: 'rejected', reason: 'occupied' });
  });

  it('returns rejected/no-op when source equals target', () => {
    const r = decideBedMoveAction({
      sourceBed: occupied,
      sourceOccupant: occupant,
      targetBed: occupied,
      targetOccupant: occupant,
    });
    expect(r).toEqual({ action: 'rejected', reason: 'no-op' });
  });

  it('returns show-modal with from/to descriptors when target is empty + unlocked', () => {
    const r = decideBedMoveAction({
      sourceBed: occupied,
      sourceOccupant: occupant,
      targetBed: empty,
      targetOccupant: null,
    });
    expect(r).toEqual({
      action: 'show-modal',
      from: { bedno: '04', roomno: 'LR1' },
      to: { bedno: '02', roomno: 'LR1' },
      an: 'AN1',
    });
  });
});
