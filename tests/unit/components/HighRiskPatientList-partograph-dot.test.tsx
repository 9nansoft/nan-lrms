// HighRiskPatientList — partograph severity dot tests
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import type { HighRiskPatient } from '@/components/dashboard/HighRiskPatientList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function basePatient(overrides: Partial<HighRiskPatient> = {}): HighRiskPatient {
  return {
    an: 'AN100',
    hn: 'HN100',
    name: 'สมศรี ใจดี',
    age: 28,
    gaWeeks: 38,
    cpdScore: 12,
    riskLevel: 'HIGH',
    hospital: 'รพ.ขอนแก่น',
    hcode: 'H001',
    admitDate: new Date().toISOString(),
    lastVitalAt: new Date().toISOString(),
    partographSeverity: null,
    partographAlertCount: null,
    ...overrides,
  };
}

describe('HighRiskPatientList — partograph severity dot', () => {
  it('renders a critical-coloured dot when partographSeverity is CRITICAL', () => {
    const patient = basePatient({
      an: 'AN500',
      partographSeverity: 'CRITICAL',
      partographAlertCount: 3,
    });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);

    // Dot appears in both desktop and mobile renderings (jsdom renders both)
    const dots = container.querySelectorAll('[data-testid="partograph-severity-dot-AN500"]');
    expect(dots.length).toBeGreaterThanOrEqual(1);

    const dot = dots[0]!;
    expect(dot.className).toContain('bg-red-500');
    expect(dot.getAttribute('title')).toBe('Partograph: วิกฤต (3 ข้อ)');
  });

  it('renders an alert-coloured dot for ALERT severity', () => {
    const patient = basePatient({
      an: 'AN600',
      partographSeverity: 'ALERT',
      partographAlertCount: 1,
    });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const dot = container.querySelector('[data-testid="partograph-severity-dot-AN600"]');
    expect(dot).not.toBeNull();
    expect(dot!.className).toContain('bg-orange-500');
    expect(dot!.getAttribute('title')).toBe('Partograph: เตือน (1 ข้อ)');
  });

  it('does NOT render the dot when partographSeverity is null', () => {
    const patient = basePatient({ an: 'AN700', partographSeverity: null, partographAlertCount: null });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const dot = container.querySelector('[data-testid="partograph-severity-dot-AN700"]');
    expect(dot).toBeNull();
  });

  it('uses 0 alerts in the title when partographAlertCount is null but severity is set', () => {
    // Defensive: severity present without count — title should still render with "(0 ข้อ)"
    const patient = basePatient({
      an: 'AN800',
      partographSeverity: 'WARN',
      partographAlertCount: null,
    });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const dot = container.querySelector('[data-testid="partograph-severity-dot-AN800"]');
    expect(dot).not.toBeNull();
    expect(dot!.getAttribute('title')).toBe('Partograph: ระวัง (0 ข้อ)');
  });
});
