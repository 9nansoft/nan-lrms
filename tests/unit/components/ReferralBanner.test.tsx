// ReferralBanner component tests — TDD
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReferralBanner } from '@/components/patient/ReferralBanner';
import { RiskLevel } from '@/types/domain';

describe('ReferralBanner', () => {
  it('renders nothing for LOW risk', () => {
    const { container } = render(
      <ReferralBanner score={3} riskLevel={RiskLevel.LOW} recommendation="ติดตามปกติ" />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  // 2026-04-21 redesign moved color from Tailwind class tokens
  // (bg-amber-50 / bg-red-50) to risk-palette inline gradients. The tests
  // now pin the semantic risk via the palette hex that drives the accent
  // stripe + color-mix gradient.
  it('renders amber gradient for MEDIUM risk', () => {
    render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    const style = banner.getAttribute('style') ?? '';
    // JSDOM normalizes hex #eab308 to rgb(234, 179, 8) in computed styles.
    expect(style).toMatch(/eab308|234,\s*179,\s*8/i);
  });

  it('renders red gradient for HIGH risk', () => {
    render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    const style = banner.getAttribute('style') ?? '';
    // JSDOM normalizes #ef4444 → rgb(239, 68, 68) and #dc2626 → rgb(220, 38, 38).
    expect(style).toMatch(/ef4444|dc2626|239,\s*68,\s*68|220,\s*38,\s*38/i);
  });

  it('displays the CPD score in the badge', () => {
    render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('shows referral text for HIGH risk', () => {
    render(
      <ReferralBanner score={10} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    // Redesigned copy — standalone CTA headline without the
    // "คำแนะนำ" prefix (the banner itself IS the recommendation).
    expect(screen.getByText('ควรประสานส่งต่อทันที')).toBeTruthy();
  });

  it('shows monitoring text for MEDIUM risk', () => {
    render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ" />,
    );
    // Redesigned copy — two phrases joined by a middle-dot separator.
    expect(screen.getByText('เฝ้าระวังใกล้ชิด · เตรียมพร้อมส่งต่อ')).toBeTruthy();
  });

  it('shows recommendation text from props', () => {
    render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="Custom recommendation" />,
    );
    expect(screen.getByText(/Custom recommendation/)).toBeTruthy();
  });

  it('includes pulsing dot indicator for HIGH risk', () => {
    const { container } = render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    const pulsingElement = container.querySelector('.animate-ping');
    expect(pulsingElement).toBeTruthy();
  });

  it('does not include pulsing dot for MEDIUM risk', () => {
    const { container } = render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ" />,
    );
    const pulsingElement = container.querySelector('.animate-ping');
    expect(pulsingElement).toBeNull();
  });

  it('has print:hidden class to avoid printing', () => {
    render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner.className).toContain('print:hidden');
  });

  it('has accessible aria-label', () => {
    render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner.getAttribute('aria-label')).toContain('เสี่ยงสูง');
  });
});
