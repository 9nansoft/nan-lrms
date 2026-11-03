// ReferralBanner component tests — TDD
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReferralBanner } from '@/components/patient/ReferralBanner';
import { RiskLevel } from '@/types/domain';
import { COLOR } from '@/config/design-tokens';
import { hexToRgb } from '../../helpers/color';

describe('ReferralBanner', () => {
  it('renders nothing for LOW risk', () => {
    const { container } = render(
      <ReferralBanner score={3} riskLevel={RiskLevel.LOW} recommendation="ติดตามปกติ" />,
    );
    expect(container.firstElementChild).toBeNull();
  });

  // Sub-project 3: the banner takes its tint and accent from RISK_LEVELS (design
  // tokens). The tests pin the semantic risk via those token colours.
  it('renders amber gradient for MEDIUM risk', () => {
    render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(banner.style.backgroundColor).toBe(hexToRgb(COLOR.riskMediumTint));
    expect(banner.style.borderLeftColor).toBe(hexToRgb(COLOR.riskMedium));
  });

  it('renders red gradient for HIGH risk', () => {
    render(
      <ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ควรประสานส่งต่อทันที!" />,
    );
    const banner = screen.getByRole('alert');
    expect(banner).toBeTruthy();
    expect(banner.style.backgroundColor).toBe(hexToRgb(COLOR.riskHighTint));
    expect(banner.style.borderLeftColor).toBe(hexToRgb(COLOR.riskHigh));
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
    const pulsingElement = container.querySelector('[class*="animate-ping"]');
    expect(pulsingElement).toBeTruthy();
  });

  it('does not include pulsing dot for MEDIUM risk', () => {
    const { container } = render(
      <ReferralBanner score={7} riskLevel={RiskLevel.MEDIUM} recommendation="เฝ้าระวังใกล้ชิด, เตรียมพร้อมส่งต่อ" />,
    );
    const pulsingElement = container.querySelector('[class*="animate-ping"]');
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
