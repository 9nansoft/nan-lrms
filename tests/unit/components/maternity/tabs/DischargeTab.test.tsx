/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 39: DischargeTab read-only — TDD: write tests FIRST. Like BedTab, this
// tab consumes BedOccupancy directly. Discharge fields (dchdate/dchtime/...)
// aren't in the occupancy snapshot because we filter on confirm_discharge='N',
// so the read-only display is a "still admitted" placeholder echoing
// regdate/regtime.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { DischargeTab } from '@/components/maternity/tabs/DischargeTab';
import type { BedOccupancy } from '@/types/maternity-ward';

const baseOccupant: BedOccupancy = {
  an: 'AN1',
  hn: 'HN1',
  regdate: '2026-04-19',
  regtime: '10:00:00',
  ward: '03',
  bedno: '07',
  roomno: 'LR1',
  bedtype: 'Labor',
  roomname: 'ห้องคลอด 1',
  pname: null,
  fname: null,
  lname: null,
  birthday: null,
  gravida: null,
  ga: null,
  incharge_doctor_name: null,
  last_observation_at: null,
  last_cervix_cm: null,
};

describe('DischargeTab', () => {
  it('shows admitted message + admit timestamp when occupant present', () => {
    render(<DischargeTab occupant={baseOccupant} />);
    expect(screen.getByText(/ยังไม่มีการจำหน่าย/)).toBeInTheDocument();
    expect(screen.getByText(/2026-04-19/)).toBeInTheDocument();
  });

  it('shows ไม่พบข้อมูล when occupant is null', () => {
    render(<DischargeTab occupant={null} />);
    expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument();
  });
});
