// tests/helpers/ward-fixtures.ts
// Shared ward-board fixtures for unit, integration and E2E tests. Type-only
// imports keep this file loadable by Playwright without the @/ alias.
import type { BedOccupancyFull, BedSlot, MaternityWard } from '@/types/maternity-ward';

export const HOUR = 3_600_000;

/** Local wall-clock parts `msAgo` before `now`, in the shape HOSxP returns
 *  (regdate 'YYYY-MM-DD', regtime 'HH:MM:SS'). The app parses them as local time. */
export function localParts(now: number, msAgo: number): { date: string; time: string } {
  const d = new Date(now - msAgo);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    time: `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
  };
}

export function makeBed(
  bedno: string,
  roomno: string,
  bed_order: number | null,
  opts: Partial<BedSlot> = {},
): BedSlot {
  return {
    bedno,
    roomno,
    bed_order,
    bed_lock: 'N',
    bed_status_type_id: 1,
    room_name: roomno,
    room_display_number: 1,
    ...opts,
  };
}

export function makeOccupant(
  o: Partial<BedOccupancyFull> & Pick<BedOccupancyFull, 'an' | 'bedno' | 'roomno'>,
): BedOccupancyFull {
  return {
    hn: `HN-${o.an}`,
    regdate: '2026-04-19',
    regtime: '10:00:00',
    ward: '03',
    bedtype: null,
    roomname: o.roomno,
    pname: 'นาง',
    fname: 'ทดสอบ',
    lname: 'ทดสอบ',
    birthday: '1996-04-19',
    blood_grp: null,
    allergy_count: 0,
    pttype_name: null,
    prediag: null,
    admit_bw_kg: null,
    patient_height: null,
    gravida: 2,
    ga: 38,
    incharge_doctor_name: null,
    last_observation_at: null,
    last_cervix_cm: null,
    last_station: null,
    last_fhr: null,
    last_contr_freq: null,
    last_contr_duration: null,
    last_contr_strength: null,
    last_oxytocin_uml: null,
    last_oxytocin_drops: null,
    last_iv_fluids: null,
    last_amniotic: null,
    last_bp_sys: null,
    last_bp_dia: null,
    last_temp: null,
    last_pulse: null,
    last_rr: null,
    last_spo2: null,
    last_spo2_o2: null,
    last_weight: null,
    last_height: null,
    last_bsa: null,
    last_pain: null,
    last_assess_date: null,
    last_assess_time: null,
    last_assess_staff: null,
    ...o,
  };
}

const LR1 = { room_name: 'ห้องรอคลอด 1', room_display_number: 1 };
const LR2 = { room_name: 'ห้องคลอด 2', room_display_number: 2 };

/**
 * Nine beds in two rooms, deliberately unsorted. It covers:
 *  - bed_order nulls-last (bed 03) and bed_order ties broken by bedno (06/07);
 *  - two locked empty beds (08, 09);
 *  - one occupant per labour stage: latent (01), active (02), transition (04),
 *    prolonged latent (06: admitted 12.5 h ago, Cx 3).
 */
export function wardScenario(now: number) {
  const at = (hoursAgo: number) => localParts(now, hoursAgo * HOUR);
  const wards: MaternityWard[] = [{ ward: '03', name: 'ห้องคลอดทดสอบ', real_bedcount: 9 }];
  const beds: BedSlot[] = [
    makeBed('09', 'LR2', 3, { ...LR2, bed_lock: 'Y' }),
    makeBed('03', 'LR1', null, LR1),
    makeBed('05', 'LR1', 4, LR1),
    makeBed('07', 'LR2', 1, LR2),
    makeBed('01', 'LR1', 1, LR1),
    makeBed('04', 'LR1', 3, LR1),
    makeBed('06', 'LR2', 1, LR2),
    makeBed('02', 'LR1', 2, LR1),
    makeBed('08', 'LR2', 2, { ...LR2, bed_lock: 'Y' }),
  ];
  const occ = (an: string, bedno: string, roomno: string, fname: string, hoursAgo: number, cx: number | null) =>
    makeOccupant({ an, bedno, roomno, fname, regdate: at(hoursAgo).date, regtime: at(hoursAgo).time, last_cervix_cm: cx });
  const occupancy: BedOccupancyFull[] = [
    occ('AN-LAT', '01', 'LR1', 'ลัดดา', 1, null),
    occ('AN-ACT', '02', 'LR1', 'อรุณี', 4, 5),
    occ('AN-TRN', '04', 'LR1', 'ทิพวรรณ', 5, 8),
    occ('AN-PRL', '06', 'LR2', 'ประไพ', 12.5, 3),
  ];
  return {
    wards,
    beds,
    occupancy,
    expected: {
      order: ['01', '02', '04', '05', '03', '06', '07', '08', '09'],
      totalBeds: 9,
      occupied: 4,
      free: 3,
      locked: 2,
      prolongedLatent: 1,
      rooms: {
        LR1: { name: LR1.room_name, total: 5, occupied: 3, free: 2, locked: 0 },
        LR2: { name: LR2.room_name, total: 4, occupied: 1, free: 1, locked: 2 },
      },
    },
  } as const;
}
