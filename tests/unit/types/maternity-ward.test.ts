// tests/unit/types/maternity-ward.test.ts
import { describe, it, expectTypeOf } from 'vitest';
import type {
  MaternityWard, BedSlot, BedOccupancy, PartographRow, VitalSignRow,
  LabourRecord, PregnancyRecord, LaborRecord, LabourMedRow, StageMedRow,
  ComplicationRow, InfantRow, BedMoveArgs, DischargeArgs,
} from '@/types/maternity-ward';

describe('maternity-ward types', () => {
  it('MaternityWard has ward + name + real_bedcount', () => {
    const w: MaternityWard = { ward: '03', name: 'ห้องคลอด', real_bedcount: 12 };
    expectTypeOf(w.ward).toBeString();
  });

  it('BedSlot has bedno + roomno + bed_lock', () => {
    const b: BedSlot = {
      bedno: '01', roomno: 'LR1', bed_order: 1,
      bed_lock: 'N', bed_status_type_id: null,
      room_name: 'Labor Room 1', room_display_number: 1,
    };
    expectTypeOf(b.bedno).toBeString();
  });

  it('BedOccupancy has the BMS join columns', () => {
    const o: BedOccupancy = {
      an: 'AN1', hn: 'HN1', regdate: '2026-04-19', regtime: '10:00:00',
      ward: '03', bedno: '01', roomno: 'LR1', bedtype: null, roomname: null,
      pname: null, fname: null, lname: null, birthday: null,
      gravida: null, ga: null, incharge_doctor_name: null,
      last_observation_at: null, last_cervix_cm: null,
    };
    expectTypeOf(o.an).toBeString();
  });

  it('PartographRow allows numeric + string clinical fields', () => {
    const p: PartographRow = {
      ipt_labour_partograph_id: 1, ipt_labour_id: 1, an: 'AN1',
      observe_datetime: '2026-04-19T08:00:00', hour_no: 1,
      fetal_heart_rate: 140, amniotic_fluid: 'C', moulding: '+',
      cervical_dilation_cm: 4, descent_of_head: '3/5',
      contraction_per_10min: 3, contraction_duration_sec: 30, contraction_strength: 'M',
      oxytocin_uml: null, oxytocin_drops_min: null, drugs_iv_fluids: null,
      pulse: 80, bp_systolic: 120, bp_diastolic: 70, temperature: 36.8,
      urine_volume_ml: null, urine_protein: null, urine_glucose: null, urine_acetone: null,
      note: null,
    };
    expectTypeOf(p.cervical_dilation_cm).toBeNullable();
  });

  it('BedMoveArgs has all required fields for iptbedmove insert', () => {
    const a: BedMoveArgs = {
      an: 'AN1', oldWard: '03', oldBedno: '01',
      newWard: '03', newBedno: '02', newRoomno: 'LR1', reason: 'patient request',
    };
    expectTypeOf(a.an).toBeString();
  });

  it('DischargeArgs has dchdate + dchtime + dchtype + dchstts', () => {
    const d: DischargeArgs = {
      an: 'AN1', dchdate: '2026-04-19', dchtime: '14:00:00',
      dchtype: '1', dchstts: '1',
    };
    expectTypeOf(d.dchdate).toBeString();
  });
});
