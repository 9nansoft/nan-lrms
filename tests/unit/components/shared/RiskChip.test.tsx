import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RiskChip } from '@/components/shared/RiskChip';
import { RiskLevel } from '@/types/domain';
import { COLOR } from '@/config/design-tokens';
import { RISK_LEVELS } from '@/config/risk-levels';
import { hexToRgb } from '../../../helpers/color';

describe('RiskChip', () => {
  it('chip: tint background + AA text colour from tokens, Thai aria-label with score', () => {
    render(<RiskChip level={RiskLevel.HIGH} score={11.5} />);
    const chip = screen.getByRole('status');
    expect(chip).toHaveAccessibleName('เสี่ยงสูง คะแนน 11.5');
    expect(chip.style.backgroundColor).toBe(hexToRgb(COLOR.riskHighTint));
    expect(chip.style.color).toBe(hexToRgb(COLOR.riskHighText));
    expect(chip).toHaveTextContent('11.5');
  });

  it('chip without score shows the Thai label', () => {
    render(<RiskChip level={RiskLevel.LOW} />);
    expect(screen.getByRole('status')).toHaveTextContent('เสี่ยงต่ำ');
  });

  it('children override the visible text but not the accessible name', () => {
    render(<RiskChip level={RiskLevel.MEDIUM} label="ความเสี่ยงระดับ 2">HR2</RiskChip>);
    const chip = screen.getByRole('status');
    expect(chip).toHaveTextContent('HR2');
    expect(chip).toHaveAccessibleName('ความเสี่ยงระดับ 2');
  });

  it('dot variant renders a marker dot plus label, colour never the only signal', () => {
    const { container } = render(<RiskChip level={RiskLevel.MEDIUM} variant="dot" pulse />);
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.style.backgroundColor).toBe(hexToRgb(COLOR.riskMedium));
    expect(dot.className).toContain('animate-pulse');
    expect(screen.getByText('เสี่ยงปานกลาง')).toBeInTheDocument();
  });

  it('passes through data-* attributes', () => {
    render(<RiskChip level={RiskLevel.HIGH} data-risk="HR3" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-risk', 'HR3');
  });

  it('risk-levels config reads every colour from tokens', () => {
    expect(RISK_LEVELS[RiskLevel.HIGH]).toMatchObject({
      color: COLOR.riskHigh,
      bgColor: COLOR.riskHighTint,
      textColor: COLOR.riskHighText,
    });
    expect(RISK_LEVELS[RiskLevel.LOW].textColor).toBe(COLOR.riskLowText);
  });
});
