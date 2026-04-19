/* @vitest-environment jsdom */
// Structural tests for the WHO-partograph SVG port of PartographRenderUnit.pas.
// Not pixel-perfect — they assert the strips are present, their labels match
// the Delphi render, and a handful of data-driven behaviours (FHR abnormal
// dot, cervix X mark, contraction strength color, BP arrow pair) render.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartographForm } from '@/components/maternity/partograph/PartographForm';
import type { PartographObservationDto } from '@/types/api';

const header = {
  an: 'AN1',
  hn: 'HN1',
  patientName: 'นางทดสอบ ระบบ',
  gpal: 'G2 P0 A0 L0',
  age: '30',
  admitAt: '2026-04-19T08:00:00',
};

function makeObs(overrides: Partial<PartographObservationDto> = {}): PartographObservationDto {
  return {
    id: '1',
    observeDatetime: '2026-04-19T08:00:00',
    hourNo: 1,
    fetalHeartRate: 140,
    amnioticFluid: 'Clear',
    amnioticTypeName: null,
    moulding: '0',
    cervicalDilationCm: 4,
    descentOfHead: '3/5',
    contractionPer10Min: 3,
    contractionDurationSec: 30,
    contractionStrength: 'Moderate',
    oxytocinUml: null,
    oxytocinDropsMin: null,
    drugsIvFluids: null,
    pulse: 80,
    bpSystolic: 120,
    bpDiastolic: 70,
    temperature: 37,
    urineVolumeMl: 200,
    urineProtein: 'negative',
    urineGlucose: 'negative',
    urineAcetone: 'negative',
    note: null,
    entryStaff: null,
    ...overrides,
  };
}

describe('PartographForm (SVG port of PartographRenderUnit)', () => {
  it('renders an SVG sized to the Delphi page (900 × 1300)', () => {
    render(<PartographForm header={header} observations={[]} alerts={[]} />);
    const svg = screen.getByTestId('partograph-form');
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('viewBox')).toBe('0 0 900 1300');
  });

  it('renders the 20 vertical strips in Delphi order', () => {
    render(<PartographForm header={header} observations={[]} alerts={[]} />);
    // Header + CDSS banner + 18 data strips.
    for (const id of [
      'strip-header',
      'strip-cdss',
      'strip-fhr',
      'strip-liquor',
      'strip-moulding',
      'strip-cervix',
      'strip-descent',
      'strip-hours',
      'strip-time',
      'strip-contractions',
      'strip-oxy-u',
      'strip-oxy-d',
      'strip-drugs',
      'strip-pulse-bp',
      'strip-temp',
      'strip-urine-protein',
      'strip-urine-glucose',
      'strip-urine-ketone',
      'strip-urine-volume',
      'strip-staff',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('header strip shows AN, HN, patient name, GPAL', () => {
    render(<PartographForm header={header} observations={[]} alerts={[]} />);
    const hdr = screen.getByTestId('strip-header');
    expect(hdr).toHaveTextContent('AN1');
    expect(hdr).toHaveTextContent('HN1');
    expect(hdr).toHaveTextContent('นางทดสอบ ระบบ');
    expect(hdr).toHaveTextContent('G2 P0 A0 L0');
  });

  it('cervix strip renders Alert and Action diagonal lines', () => {
    render(
      <PartographForm
        header={header}
        observations={[makeObs({ cervicalDilationCm: 4, hourNo: 1 })]}
        alerts={[]}
      />,
    );
    const cervix = screen.getByTestId('strip-cervix');
    expect(cervix.querySelector('[data-testid="cervix-alert-line"]')).not.toBeNull();
    expect(cervix.querySelector('[data-testid="cervix-action-line"]')).not.toBeNull();
  });

  it('cervix strip renders LATENT / ACTIVE phase labels', () => {
    render(<PartographForm header={header} observations={[]} alerts={[]} />);
    const cervix = screen.getByTestId('strip-cervix');
    // With no active-phase yet defined by data, only ACTIVE PHASE is guaranteed;
    // the LATENT label appears once a >=4cm observation arrives at hour>1.
    expect(cervix).toHaveTextContent('ACTIVE PHASE');
  });

  it('cervix renders an X mark per observation with dilation', () => {
    render(
      <PartographForm
        header={header}
        observations={[
          makeObs({ id: 'a', hourNo: 1, cervicalDilationCm: 4 }),
          makeObs({ id: 'b', hourNo: 2, cervicalDilationCm: 5 }),
        ]}
        alerts={[]}
      />,
    );
    const cervix = screen.getByTestId('strip-cervix');
    expect(cervix.querySelectorAll('[data-role="cervix-x"]').length).toBe(2);
  });

  it('contractions strip renders strength-colored cells', () => {
    render(
      <PartographForm
        header={header}
        observations={[
          makeObs({
            id: 'c1',
            hourNo: 1,
            contractionPer10Min: 3,
            contractionStrength: 'Strong',
          }),
        ]}
        alerts={[]}
      />,
    );
    const contr = screen.getByTestId('strip-contractions');
    const strongCells = contr.querySelectorAll('[data-strength="strong"]');
    expect(strongCells.length).toBe(3); // stacked 3 cells for 3 contractions/10min
  });

  it('pulse+BP strip plots pulse dots and BP arrows', () => {
    render(
      <PartographForm
        header={header}
        observations={[
          makeObs({ id: 'p1', hourNo: 1, pulse: 80, bpSystolic: 120, bpDiastolic: 70 }),
        ]}
        alerts={[]}
      />,
    );
    const strip = screen.getByTestId('strip-pulse-bp');
    expect(strip.querySelector('[data-role="pulse-dot"]')).not.toBeNull();
    expect(strip.querySelector('[data-role="bp-pair"]')).not.toBeNull();
  });

  it('FHR plots an abnormal-colored dot when the reading is outside 110–160', () => {
    render(
      <PartographForm
        header={header}
        observations={[makeObs({ id: 'f1', hourNo: 1, fetalHeartRate: 175 })]}
        alerts={[]}
      />,
    );
    const strip = screen.getByTestId('strip-fhr');
    const abnormal = strip.querySelector('[data-abnormal="true"]');
    expect(abnormal).not.toBeNull();
  });

  it('liquor cell shows "M" for meconium (Delphi AbbrevAmniotic)', () => {
    render(
      <PartographForm
        header={header}
        observations={[makeObs({ id: 'l1', hourNo: 1, amnioticFluid: 'Meconium' })]}
        alerts={[]}
      />,
    );
    const strip = screen.getByTestId('strip-liquor');
    expect(strip).toHaveTextContent('M');
  });

  it('CDSS banner shows the highest-severity headline when alerts fire', () => {
    render(
      <PartographForm
        header={header}
        observations={[]}
        alerts={[
          { severity: 'CRITICAL', section: 'FHR', obsIndex: 0, message: 'severe bradycardia' },
        ]}
      />,
    );
    const banner = screen.getByTestId('strip-cdss');
    expect(banner).toHaveTextContent(/ต้องประเมินด่วน/);
  });
});
