// tests/unit/services/ward-board.test.ts
import { describe, it, expect } from 'vitest';
import {
  LABOUR_STAGE_CM,
  PROLONGED_LATENT_RULE,
  classifyLabourStage,
  dedupeOccupantsByAn,
  findOccupantByAn,
  groupBedsByRoom,
  hoursSinceAdmit,
  placeOccupants,
  summarizeBeds,
} from '@/services/ward-board';
import { HOUR, localParts, makeBed, makeOccupant, wardScenario } from '../../helpers/ward-fixtures';

const NOW = new Date('2026-04-19T14:00:00').getTime();
const occAt = (hoursAgo: number, cx: number | null, bedno = '01') => {
  const p = localParts(NOW, hoursAgo * HOUR);
  return makeOccupant({
    an: `AN-${bedno}`,
    bedno,
    roomno: 'LR1',
    regdate: p.date,
    regtime: p.time,
    last_cervix_cm: cx,
  });
};

describe('ward-board rules keep their historical values', () => {
  it('prolonged latent = ≥12 h since admit and Cx unknown or < 4 cm; active from 4, transition from 7', () => {
    expect(PROLONGED_LATENT_RULE).toEqual({ minHours: 12, cervixBelowCm: 4 });
    expect(LABOUR_STAGE_CM).toEqual({ activeFrom: 4, transitionFrom: 7 });
  });

  it('hoursSinceAdmit parses regdate + regtime as local time; a missing regtime means midnight', () => {
    expect(hoursSinceAdmit(occAt(5, null), NOW)).toBeCloseTo(5, 5);
    expect(hoursSinceAdmit({ regdate: '2026-04-19', regtime: null }, NOW)).toBeCloseTo(14, 5);
    expect(hoursSinceAdmit({ regdate: 'garbage', regtime: null }, NOW)).toBe(0);
  });

  it.each([
    [12, null, 'prolongedLatent'],
    [12, 3.9, 'prolongedLatent'],
    [12 - 1 / 60, null, 'latent'],
    [12, 4, 'active'],
    [4, 3.9, 'latent'],
    [4, 4, 'active'],
    [4, 6.5, 'active'],
    [4, 7, 'transition'],
    [20, 9, 'transition'],
  ] as const)('%s h, Cx %s → %s', (h, cx, kind) => {
    expect(classifyLabourStage(occAt(h, cx), NOW)).toBe(kind);
  });
});

describe('groupBedsByRoom', () => {
  it('orders rooms by display number then roomno, beds by bed_order (nulls last) then bedno', () => {
    const s = wardScenario(NOW);
    const rooms = groupBedsByRoom([...s.beds]);
    expect(rooms.map((r) => r.roomno)).toEqual(['LR1', 'LR2']);
    expect(rooms.flatMap((r) => r.beds.map((b) => b.bedno))).toEqual(s.expected.order);
  });
});

describe('summarizeBeds', () => {
  it('summarizes the scenario ward exactly as the old masthead did', () => {
    const s = wardScenario(NOW);
    expect(summarizeBeds([...s.beds], [...s.occupancy], NOW)).toEqual({
      totalBeds: 9,
      occupied: 4,
      patients: 4,
      unplaced: 0,
      sharedBeds: 0,
      free: 3,
      lockedEmpty: 2,
      lockedOccupied: 0,
      prolongedLatent: 1,
      occupancyPct: 44,
    });
  });

  it('I2: surfaces admitted patients whose bed is blank or not in this layout — counted, never dropped', () => {
    const beds = [makeBed('01', 'LR1', 1), makeBed('02', 'LR1', 2)];
    const blank = { ...occAt(13, null, 'X'), an: 'AN-BLANK', bedno: '' };
    const nullBed = { ...occAt(1, 5, 'Y'), an: 'AN-NULL', bedno: null as unknown as string };
    const occ = [occAt(1, 5, '01'), occAt(1, 5, '99'), blank, nullBed];
    expect(summarizeBeds(beds, occ, NOW)).toEqual({
      totalBeds: 2,
      occupied: 1,
      patients: 4,
      unplaced: 3,
      sharedBeds: 0,
      free: 1,
      lockedEmpty: 0,
      lockedOccupied: 0,
      // The blank-bed patient (13 h, Cx unknown) still counts as prolonged latent.
      prolongedLatent: 1,
      occupancyPct: 50,
    });
  });

  it('I2: two admissions on one bed → one occupied bed, two patients, one shared bed; occupied never exceeds totalBeds', () => {
    const beds = [makeBed('01', 'LR1', 1)];
    const occ = [occAt(1, 5, '01'), { ...occAt(2, 6, '01'), an: 'AN-01-B' }];
    const sum = summarizeBeds(beds, occ, NOW);
    expect(sum).toMatchObject({
      totalBeds: 1,
      occupied: 1,
      patients: 2,
      sharedBeds: 1,
      unplaced: 0,
      free: 0,
      occupancyPct: 100,
    });
    expect(sum.occupied).toBeLessThanOrEqual(sum.totalBeds);
  });

  it('B1: a patient on a bed HOSxP has since locked is occupied, never locked or free', () => {
    const beds = [
      makeBed('01', 'LR1', 1, { bed_lock: 'Y' }),
      makeBed('02', 'LR1', 2, { bed_lock: 'Y' }),
      makeBed('03', 'LR1', 3),
    ];
    const occ = [occAt(2, 5, '01')];
    expect(summarizeBeds(beds, occ, NOW)).toEqual({
      totalBeds: 3,
      occupied: 1,
      patients: 1,
      unplaced: 0,
      sharedBeds: 0,
      free: 1,
      lockedEmpty: 1,
      lockedOccupied: 1,
      prolongedLatent: 0,
      occupancyPct: 33,
    });
  });

  it('an empty ward has no occupancy percentage', () => {
    expect(summarizeBeds([], [], NOW)).toEqual({
      totalBeds: 0,
      occupied: 0,
      patients: 0,
      unplaced: 0,
      sharedBeds: 0,
      free: 0,
      lockedEmpty: 0,
      lockedOccupied: 0,
      prolongedLatent: 0,
      occupancyPct: null,
    });
  });
});

describe('placeOccupants (I2)', () => {
  it('keeps every occupant: per bed (shared beds hold all of them) or unplaced with a reason', () => {
    const beds = [makeBed('01', 'LR1', 1), makeBed('02', 'LR1', 2)];
    const a = occAt(1, 5, '01');
    const b = { ...occAt(2, 6, '01'), an: 'AN-01-B' };
    const off = occAt(1, 5, '99');
    const blank = { ...occAt(1, 5, 'X'), an: 'AN-BLANK', bedno: '  ' };
    const p = placeOccupants(beds, [a, b, off, blank]);
    expect(p.byBed.get('01')?.map((o) => o.an)).toEqual(['AN-01', 'AN-01-B']);
    expect(p.byBed.get('02')).toBeUndefined();
    expect(p.unplaced.map((u) => [u.occupant.an, u.reason])).toEqual([
      ['AN-99', 'notInLayout'],
      ['AN-BLANK', 'noBed'],
    ]);
  });
});

describe('placeOccupants duplicates and bed-number whitespace', () => {
  const beds = [makeBed('01', 'LR1', 1), makeBed('02', 'LR1', 2)];

  it('keeps one row per AN: no false shared bed, no double count, unique keys', () => {
    const a = occAt(3, 5, '01');
    const dup = { ...a };
    const p = placeOccupants(beds, [a, dup]);
    expect(p.byBed.get('01')).toHaveLength(1);
    const sum = summarizeBeds(beds, [a, dup], NOW);
    expect(sum.patients).toBe(1);
    expect(sum.sharedBeds).toBe(0);
    expect(sum.occupied).toBe(1);
  });

  it('keeps the duplicate with the most recorded labour data', () => {
    const sparse = { ...occAt(3, null, '01'), last_station: null, last_fhr: null };
    const rich = { ...occAt(3, 5, '01'), last_station: '0', last_fhr: 140 };
    const p = placeOccupants(beds, [sparse, rich]);
    expect(p.byBed.get('01')?.[0].last_fhr).toBe(140);
    const p2 = placeOccupants(beds, [rich, sparse]);
    expect(p2.byBed.get('01')?.[0].last_fhr).toBe(140);
  });

  it('dedupes unplaced rows too', () => {
    const x = { ...occAt(1, 5, '99'), an: 'AN-X' };
    expect(placeOccupants(beds, [x, { ...x }]).unplaced).toHaveLength(1);
  });

  it('trims occupant bedno so " 01" lands on layout bed "01"', () => {
    const p = placeOccupants(beds, [{ ...occAt(1, 5, '01'), bedno: ' 01 ' }]);
    expect(p.byBed.get('01')).toHaveLength(1);
    expect(p.unplaced).toHaveLength(0);
  });

  it('trims layout bed keys but keeps byBed keyed by the layout bedno', () => {
    const padded = [makeBed(' 06', 'LR1', 1)];
    const p = placeOccupants(padded, [occAt(1, 5, '06')]);
    expect(p.byBed.get(' 06')).toHaveLength(1);
    expect(p.unplaced).toHaveLength(0);
  });
});

describe('findOccupantByAn', () => {
  it('returns the same row the board shows for a duplicated AN (the one with more labour data)', () => {
    const sparse = makeOccupant({ an: 'AN-9', bedno: '01', roomno: 'LR1', last_cervix_cm: null, last_fhr: null });
    const rich = makeOccupant({ an: 'AN-9', bedno: '01', roomno: 'LR1', last_cervix_cm: 5, last_fhr: 140 });
    expect(findOccupantByAn([sparse, rich], 'AN-9')).toBe(rich);
    expect(dedupeOccupantsByAn([sparse, rich])).toEqual([rich]);
  });

  it('matches through surrounding whitespace and returns null for unknown or empty AN', () => {
    const o = makeOccupant({ an: ' AN-7 ', bedno: '02', roomno: 'LR1' });
    expect(findOccupantByAn([o], 'AN-7')).toBe(o);
    expect(findOccupantByAn([o], 'AN-8')).toBeNull();
    expect(findOccupantByAn([o], null)).toBeNull();
  });
});
