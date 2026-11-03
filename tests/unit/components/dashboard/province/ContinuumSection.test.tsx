import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContinuumSection } from '@/components/dashboard/province/ContinuumSection';
import { ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import { makeContinuum } from '../../../../helpers/dashboard-fixtures';

describe('ContinuumSection', () => {
  it('links each board number to its board', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByRole('region', { name: 'ฝากครรภ์และการส่งต่อ' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${ANC_REGISTRY_LABEL_TH} 1,169` })).toHaveAttribute('href', '/pregnancies');
    expect(screen.getByRole('link', { name: 'ครรภ์เสี่ยงสูง HR3 106' })).toHaveAttribute('href', '/pregnancies?risk=HR3');
    expect(screen.getByRole('link', { name: /ใกล้คลอด ≤\d+ วัน 172/ })).toHaveAttribute('href', '/pregnancies?cohort=due_soon');
    const ref = screen.getByTestId('continuum-referrals');
    expect(within(ref).getByText('31')).toBeInTheDocument();
    expect(within(ref).getByText('วันนี้ 2 ราย')).toBeInTheDocument();
  });
  it('HR3 is amber, not red — red is reserved for acute intrapartum risk', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByTestId('continuum-hr3').className).toContain('bg-warn-tint');
  });
  it('the ANC registry tile explains its criteria', () => {
    render(<ContinuumSection continuum={makeContinuum()} />);
    expect(screen.getByRole('button', { name: `คำอธิบาย: ${ANC_REGISTRY_LABEL_TH}` })).toBeInTheDocument();
  });
});
