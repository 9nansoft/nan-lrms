// Newborn admissions on the labour-ward board.
//
// Ward staff admit a newborn (HOSxP ipt_admit_type_id = 4, "แรกเกิด") onto a
// bed in the labour-ward building. The occupancy SQL selects every admission
// in the ward, so each baby counted as a labouring patient and an occupied bed
// — the ward KPI row read too high, and a baby on the mother's bed showed as a
// "เตียงซ้อน" conflict. Newborns are split off before any counting and listed
// separately so staff can see (and fix) the bed assignment in HOSxP.
import { describe, it, expect } from 'vitest';
import { splitWardOccupants, summarizeBeds } from '@/services/ward-board';
import { HOSXP_ADMIT_TYPE } from '@/config/hosxp-admit-types';
import { WARD_BEDS_OCCUPANCY, WARD_BEDS_OCCUPANCY_FULL } from '@/config/hosxp-queries';
import { makeBed, makeOccupant } from '../../helpers/ward-fixtures';

const mother = makeOccupant({ an: 'AN-M', bedno: '01', roomno: 'LR1', ipt_admit_type_id: 3 });
const baby = makeOccupant({ an: 'AN-B', bedno: '01', roomno: 'LR1', ipt_admit_type_id: 4 });
const babyOwnBed = makeOccupant({
  an: 'AN-B2',
  bedno: '02',
  roomno: 'LR1',
  ipt_admit_type_id: '4',
});
const general = makeOccupant({ an: 'AN-G', bedno: '03', roomno: 'LR1', ipt_admit_type_id: 1 });
const unknown = makeOccupant({ an: 'AN-U', bedno: '04', roomno: 'LR1', ipt_admit_type_id: null });

describe('splitWardOccupants', () => {
  it('uses HOSxP admit type 4 for newborns', () => {
    expect(HOSXP_ADMIT_TYPE.NEWBORN).toBe(4);
  });

  it('moves newborn admissions out of the patient roster, whatever type the driver returns', () => {
    const { patients, newborns } = splitWardOccupants([mother, baby, babyOwnBed, general, unknown]);
    expect(patients.map((o) => o.an)).toEqual(['AN-M', 'AN-G', 'AN-U']);
    expect(newborns.map((o) => o.an)).toEqual(['AN-B', 'AN-B2']);
  });

  it('keeps every adult admission, including ones with no admit type recorded', () => {
    // A woman admitted as ทั่วไป / Refer to the labour ward is still a patient
    // on this board; only a positive newborn marker removes a row.
    expect(splitWardOccupants([general, unknown]).newborns).toEqual([]);
  });

  it('newborns no longer inflate occupied beds, patients or shared-bed conflicts', () => {
    const beds = ['01', '02', '03'].map((b) => makeBed(b, 'LR1', null));
    const { patients } = splitWardOccupants([mother, baby, babyOwnBed]);
    const s = summarizeBeds(beds, patients, Date.now());
    expect(s.patients).toBe(1);
    expect(s.occupied).toBe(1);
    expect(s.sharedBeds).toBe(0);
    expect(s.free).toBe(2);
  });
});

describe('ward occupancy SQL carries the admit type', () => {
  for (const [name, q] of [
    ['WARD_BEDS_OCCUPANCY', WARD_BEDS_OCCUPANCY],
    ['WARD_BEDS_OCCUPANCY_FULL', WARD_BEDS_OCCUPANCY_FULL],
  ] as const) {
    it(`${name} selects i.ipt_admit_type_id in both dialects`, () => {
      expect(q.postgresql).toContain('i.ipt_admit_type_id');
      expect(q.mysql).toContain('i.ipt_admit_type_id');
    });
  }
});
