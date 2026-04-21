// PartographCell rendering tests — replaces the old "partograph severity dot"
// tests. The redesigned dashboard (2026-04-21) renders partograph state as a
// 4-bar severity cell inside HighRiskPatientList, not a colored dot.
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

describe('HighRiskPatientList — partograph severity cell', () => {
  it('renders ALERT label for CRITICAL severity', () => {
    const patient = basePatient({ partographSeverity: 'CRITICAL', partographAlertCount: 3 });
    const { getByText } = render(<HighRiskPatientList patients={[patient]} />);
    expect(getByText('ALERT')).toBeTruthy();
  });

  it('renders ALERT label for ALERT severity', () => {
    const patient = basePatient({ partographSeverity: 'ALERT', partographAlertCount: 1 });
    const { getByText } = render(<HighRiskPatientList patients={[patient]} />);
    expect(getByText('ALERT')).toBeTruthy();
  });

  it('renders WARN label for WARN severity', () => {
    const patient = basePatient({ partographSeverity: 'WARN', partographAlertCount: 2 });
    const { getByText } = render(<HighRiskPatientList patients={[patient]} />);
    expect(getByText('WARN')).toBeTruthy();
  });

  it('renders OK label when severity is null', () => {
    const patient = basePatient({ partographSeverity: null, partographAlertCount: null });
    const { getByText } = render(<HighRiskPatientList patients={[patient]} />);
    expect(getByText('OK')).toBeTruthy();
  });
});
