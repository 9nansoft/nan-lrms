// P13: kiosk CPD colour uses the shared RISK_LEVELS thresholds (high >= 10,
// medium >= 5), not the old >= 6 / >= 4 rule. Kiosk palette is unchanged.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import { makeHighRiskPatient } from '../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const colorOf = (cpd: number) => {
  const { unmount } = render(
    <HighRiskPatientList variant="kiosk" patients={[makeHighRiskPatient({ cpdScore: cpd, riskLevel: 'HIGH' })]} />,
  );
  const el = screen.getByText(String(cpd));
  const c = el.style.color;
  const glow = el.style.textShadow;
  unmount();
  return { c, glow };
};

describe('HighRiskPatientList kiosk CPD thresholds (P13)', () => {
  it('CPD 7 is medium, not high', () => {
    expect(colorOf(7).c).toBe('var(--kiosk-med)');
  });
  it('CPD 10 is high, CPD 5 medium, CPD 4 low (no glow)', () => {
    expect(colorOf(10).c).toBe('var(--kiosk-high)');
    expect(colorOf(5).c).toBe('var(--kiosk-med)');
    const low = colorOf(4);
    expect(low.c).toBe('var(--kiosk-low)');
    expect(low.glow).toBe('none');
  });
});
