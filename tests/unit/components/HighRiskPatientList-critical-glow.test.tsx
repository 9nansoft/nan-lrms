// HighRiskPatientList — kiosk red-row glow extends to CRITICAL partograph
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { HighRiskPatientList } from '@/components/dashboard/HighRiskPatientList';
import type { HighRiskPatient } from '@/components/dashboard/HighRiskPatientList';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function basePatient(overrides: Partial<HighRiskPatient> = {}): HighRiskPatient {
  return {
    an: 'AN001',
    hn: 'HN001',
    name: 'X',
    age: 28,
    gaWeeks: 38,
    cpdScore: 5,
    riskLevel: 'LOW',
    hospital: 'รพ.test',
    hcode: 'H001',
    admitDate: new Date().toISOString(),
    lastVitalAt: new Date().toISOString(),
    partographSeverity: null,
    partographAlertCount: null,
    ...overrides,
  };
}

describe('HighRiskPatientList — critical-glow extension', () => {
  it('applies red border-l accent when CPD risk is HIGH (baseline)', () => {
    const patient = basePatient({ riskLevel: 'HIGH', cpdScore: 12 });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const rows = container.querySelectorAll('[data-testid="patient-row"]');
    expect(rows.length).toBe(2); // desktop + mobile
    for (const row of rows) {
      expect(row.className).toContain('border-l-red-400');
    }
  });

  it('applies red border-l accent when partographSeverity is CRITICAL even if CPD risk is not HIGH', () => {
    const patient = basePatient({
      riskLevel: 'MEDIUM',
      cpdScore: 8,
      partographSeverity: 'CRITICAL',
      partographAlertCount: 2,
    });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const rows = container.querySelectorAll('[data-testid="patient-row"]');
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.className).toContain('border-l-red-400');
    }
  });

  it('does NOT apply red border-l for non-CRITICAL partograph severity (ALERT) without HIGH CPD', () => {
    const patient = basePatient({
      riskLevel: 'MEDIUM',
      cpdScore: 8,
      partographSeverity: 'ALERT',
      partographAlertCount: 1,
    });
    const { container } = render(<HighRiskPatientList patients={[patient]} />);
    const rows = container.querySelectorAll('[data-testid="patient-row"]');
    for (const row of rows) {
      expect(row.className).not.toContain('border-l-red-400');
    }
  });
});
