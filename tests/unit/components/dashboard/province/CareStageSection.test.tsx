import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CareStageSection } from '@/components/dashboard/province/CareStageSection';
import { makeStageKPIs } from '../../../../helpers/dashboard-fixtures';

describe('CareStageSection', () => {
  it('three stage cards link to their boards', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    expect(screen.getByRole('region', { name: 'ระยะการดูแล' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ANC กำลังติดตาม/ })).toHaveAttribute('href', '/pregnancies');
    expect(screen.getByRole('link', { name: /ในห้องคลอด/ })).toHaveAttribute('href', '/hospitals');
    expect(screen.getByRole('link', { name: /คลอดแล้ว · เดือนนี้/ })).toHaveAttribute('href', '/outcomes');
  });
  it('row labels are Thai and say what getStageKPIs counts', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    const delivered = screen.getByRole('link', { name: /คลอดแล้ว · เดือนนี้/ });
    const normalRow = within(delivered).getByText('ไม่พบความผิดปกติที่บันทึก').closest('[title]');
    expect(normalRow).toHaveAttribute(
      'title',
      'การคลอดที่ไม่มีบันทึก Apgar 5 นาที < 7 หรือน้ำหนักแรกเกิด < 2,500 ก. รวมรายที่ยังไม่มีข้อมูลทารก',
    );
    expect(normalRow?.getAttribute('title')).toContain('ยังไม่มีข้อมูลทารก');
    expect(within(delivered).queryByText('ทารกปกติ')).toBeNull();
    expect(within(delivered).getByText('Apgar 5 นาที < 7')).toBeInTheDocument();
    expect(within(delivered).getByText('น้ำหนักแรกเกิด < 2,500 ก.')).toBeInTheDocument();
    expect(screen.getByText('CPD เสี่ยงสูง')).toBeInTheDocument();
    expect(screen.queryByText(/^(NORMAL|LOW APGAR|LBW|HIGH|LOW)$/)).toBeNull();
  });
  it('totals never wrap', () => {
    render(<CareStageSection stageKPIs={makeStageKPIs()} />);
    expect(screen.getByText('1,169').className).toContain('whitespace-nowrap');
  });
});
