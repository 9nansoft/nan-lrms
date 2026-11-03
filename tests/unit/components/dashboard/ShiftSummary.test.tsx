import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ShiftSummary } from '@/components/dashboard/ShiftSummary';
import { makeTrends } from '../../../helpers/dashboard-fixtures';

describe('ShiftSummary', () => {
  it('is a Thai section with current vs previous shift tiles', () => {
    render(<ShiftSummary trends={makeTrends()} />);
    expect(screen.getByRole('region', { name: 'สรุปเวร' })).toBeInTheDocument();
    expect(screen.getByText('เวรเช้า 08:00-16:00')).toBeInTheDocument();
    expect(screen.getByText('เปรียบเทียบกับ เวรดึก 00:00-08:00')).toBeInTheDocument();
    const adm = screen.getByTestId('shift-admissions');
    expect(within(adm).getByText('รับเข้า')).toBeInTheDocument();
    expect(within(adm).getByText('5')).toBeInTheDocument();
    expect(within(adm).getByText('เวรก่อน 3')).toBeInTheDocument();
    expect(screen.queryByText(/SHIFT SUMMARY|ADMISSIONS|DELIVERED|REFERRED/)).toBeNull();
  });
});
