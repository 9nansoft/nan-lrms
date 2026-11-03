import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { LaborVitalsSection } from '@/components/dashboard/province/LaborVitalsSection';
import { LABOR_TILE_HINTS } from '@/components/dashboard/province/metric-hints';
import { makeSummary, makeTrends } from '../../../../helpers/dashboard-fixtures';

describe('LaborVitalsSection', () => {
  it('shows the server counts as Thai KPI tiles', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    expect(screen.getByRole('region', { name: 'ห้องคลอดทั้งจังหวัด' })).toBeInTheDocument();
    const active = screen.getByTestId('vital-active');
    expect(within(active).getByText('12')).toBeInTheDocument();
    expect(within(active).getByText('รับใหม่ 3 รายใน 24 ชม.')).toBeInTheDocument();
    expect(screen.getByTestId('vital-high').className).toContain('bg-danger');
    expect(screen.getByTestId('vital-medium').className).toContain('bg-warn-tint');
    expect(screen.getByTestId('risk-legend')).toHaveTextContent('เสี่ยงต่ำ 5 · ปานกลาง 4 · สูง 3');
  });
  it('zero high risk is not a red tile', () => {
    render(<LaborVitalsSection summary={makeSummary({ totalHigh: 0 })} trends={makeTrends()} />);
    expect(screen.getByTestId('vital-high').className).not.toContain('bg-danger');
  });
  it('24h admissions: Thai summary, Thai chart name, Thai axis', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    const adm = screen.getByTestId('admissions-24h');
    expect(adm).toHaveTextContent('วันนี้ 6 ราย · เฉลี่ย 7 วัน 4.2 ราย/วัน');
    expect(within(adm).getByRole('img', { name: 'จำนวนรับเข้ารายชั่วโมง 24 ชั่วโมงล่าสุด' })).toBeInTheDocument();
    expect(within(adm).getByText('ตอนนี้')).toBeInTheDocument();
  });
  it('no English mono labels, and every tile has a hint', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    expect(screen.queryByText(/ACTIVE LABOR|ADMISSIONS|HIGH RISK|MEDIUM|NOW/)).toBeNull();
    expect(screen.getByRole('button', { name: 'คำอธิบาย: ผู้คลอดในห้องคลอด' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'คำอธิบาย: CPD เสี่ยงสูง' })).toBeInTheDocument();
  });
  it('hint copy describes only what the tiles show (no kiosk-only ▲ +N or bottom colour strip)', () => {
    for (const h of Object.values(LABOR_TILE_HINTS)) {
      const text = JSON.stringify(h.body);
      expect(text).not.toContain('▲');
      expect(text).not.toContain('+N');
      expect(text).not.toContain('แถบสีด้านล่าง');
    }
  });
  it('axis starts at the first bucket (23 h before the current hour), not -24', () => {
    render(<LaborVitalsSection summary={makeSummary()} trends={makeTrends()} />);
    const adm = screen.getByTestId('admissions-24h');
    expect(within(adm).getByText('−23 ชม.')).toBeInTheDocument();
    expect(within(adm).queryByText('−24 ชม.')).toBeNull();
  });
});
