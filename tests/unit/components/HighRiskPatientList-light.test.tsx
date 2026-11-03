// UI sub-project 2: Thai, token-styled light variant; kiosk branch untouched.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { RISK_LEVELS } from '@/config/risk-levels';
import { COLOR } from '@/config/design-tokens';
import { RiskLevel } from '@/types/domain';
import { hexToRgb } from '../../helpers/color';
import { makeHighRiskPatient } from '../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('HighRiskPatientList — light (Thai) variant', () => {
  it('config carries short Thai risk labels', () => {
    expect(RISK_LEVELS[RiskLevel.HIGH].shortLabelTh).toBe('สูง');
    expect(RISK_LEVELS[RiskLevel.MEDIUM].shortLabelTh).toBe('ปานกลาง');
    expect(RISK_LEVELS[RiskLevel.LOW].shortLabelTh).toBe('ต่ำ');
  });
  it('Thai column headers', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient()]} />);
    for (const h of ['ความเสี่ยง', 'ผู้คลอด', 'โรงพยาบาล', 'รับเข้า / นาน', 'สัญญาณชีพล่าสุด', 'พาร์โทกราฟ', 'หมายเหตุ']) {
      expect(screen.getByText(h)).toBeInTheDocument();
    }
    expect(screen.queryByText(/^(RISK|PATIENT|HOSPITAL|LAST VITAL|NOTE)$/)).toBeNull();
  });
  it('risk renders through the shared RiskChip: short text, full Thai name, data-risk kept', () => {
    const { container } = render(<HighRiskPatientList patients={[makeHighRiskPatient()]} />);
    const chip = container.querySelector('[data-risk="HIGH"]')!;
    expect(chip.textContent).toBe('สูง');
    expect(chip).toHaveAttribute('aria-label', 'เสี่ยงสูง');
  });
  it('CPD score colour follows RISK_LEVELS (7 is MEDIUM), not the old >= 6 rule', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient({ cpdScore: 7, riskLevel: 'MEDIUM' })]} />);
    fireEvent.click(screen.getByText(/ทั้งหมดในห้องคลอด/));
    expect(screen.getByText('7').style.color).toBe(hexToRgb(COLOR.riskMediumText));
  });
  it('embedded drops the old section label (the SectionCard owns the title)', () => {
    render(<HighRiskPatientList patients={[makeHighRiskPatient()]} embedded />);
    expect(screen.queryByText(/High-risk & Active labor/)).toBeNull();
  });
  it('the empty state is tab-aware and uses EmptyState', () => {
    render(<HighRiskPatientList patients={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent('ไม่มีผู้คลอดเสี่ยงสูงในห้องคลอดขณะนี้');
    fireEvent.click(screen.getByText(/ทั้งหมดในห้องคลอด/));
    expect(screen.getByRole('status')).toHaveTextContent('ไม่มีผู้คลอดในห้องคลอดขณะนี้');
  });
  it('the loading skeleton uses the same grid as the rows', () => {
    const { container } = render(<HighRiskPatientList patients={[]} isLoading />);
    const header = container.querySelector('.grid') as HTMLElement;
    const skeleton = container.querySelectorAll('.grid')[1] as HTMLElement;
    expect(skeleton.style.gridTemplateColumns).toBe(header.style.gridTemplateColumns);
    expect(skeleton.children.length).toBe(12);
  });
  it('kiosk keeps its English columns and chip', () => {
    const { container } = render(<HighRiskPatientList patients={[makeHighRiskPatient()]} variant="kiosk" />);
    expect(screen.getByText('RISK')).toBeInTheDocument();
    expect(container.querySelector('[data-risk="HIGH"]')!.textContent).toBe('HIGH');
  });
  it('M4: an unknown / prototype-key risk level renders as plain text, not a chip', () => {
    const { container } = render(
      <HighRiskPatientList patients={[makeHighRiskPatient({ riskLevel: 'toString' as never })]} />,
    );
    fireEvent.click(screen.getByText(/ทั้งหมดในห้องคลอด/));
    expect(container.querySelector('[data-risk="toString"]')).toBeNull();
    expect(screen.getByText('toString')).toBeInTheDocument();
  });
});
