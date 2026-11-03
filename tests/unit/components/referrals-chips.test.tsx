import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgeChip, Pill, STATUS_META, URGENCY_META } from '@/components/referrals/chips';

describe('referral chips', () => {
  it('status and urgency pills use token tones (AA), not marker colours as text', () => {
    render(
      <>
        <Pill meta={STATUS_META.IN_TRANSIT} fallback="IN_TRANSIT" />
        <Pill meta={URGENCY_META.EMERGENCY} fallback="EMERGENCY" />
        <Pill meta={undefined} fallback="WEIRD" />
      </>,
    );
    expect(screen.getByText('กำลังเดินทาง').className).toContain('text-warn-text');
    expect(screen.getByText('ฉุกเฉิน').className).toContain('text-danger-text');
    expect(screen.getByText('WEIRD').className).toContain('text-ink-muted');
  });
  it('age chip names the overdue age', () => {
    render(<AgeChip age="critical" initiatedAt={new Date(Date.now() - 72 * 3600_000).toISOString()} />);
    expect(screen.getByText(/ค้าง 3 วัน/).className).toContain('text-danger-text');
  });
});
