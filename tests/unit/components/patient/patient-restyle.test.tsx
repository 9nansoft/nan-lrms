// tests/unit/components/patient/patient-restyle.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRef } from 'react';
import { PatientHeader } from '@/components/patient/PatientHeader';
import { StickyPatientHeader } from '@/components/patient/StickyPatientHeader';
import { ReferralBanner } from '@/components/patient/ReferralBanner';
import { QuickStatsBar } from '@/components/patient/QuickStatsBar';
import { ClinicalData } from '@/components/patient/ClinicalData';
import { CurrentVitalsPanel } from '@/components/patient/CurrentVitalsPanel';
import { RiskLevel } from '@/types/domain';
import { COLOR } from '@/config/design-tokens';
import { hexToRgb } from '../../../helpers/color';

const hospital = { name: 'รพ.น่าน', level: 'A_S' };

describe('PatientHeader on tokens', () => {
  it('brand band, Thai CPD tile with the configured maximum and the shared risk label', () => {
    const { container } = render(
      <PatientHeader
        hn="1"
        an="AN-1"
        name="นาง ทดสอบ ใจดี"
        age={28}
        admitDate="2026-01-15T08:30:00Z"
        laborStatus="ACTIVE"
        hospital={hospital}
        cpdScore={{ score: 7, riskLevel: RiskLevel.MEDIUM }}
      />,
    );
    expect(screen.getByTestId('patient-header').className).toContain('bg-brand-strong');
    expect(screen.getByText('คะแนน CPD')).toBeInTheDocument();
    expect(screen.getByText('/ 14.5')).toBeInTheDocument();
    expect(screen.getByText('เสี่ยงปานกลาง')).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}|rgba\(255/i);
  });
});

describe('StickyPatientHeader (B2)', () => {
  it('sticks under the shell header inside the content column, never fixed to the viewport', () => {
    let fire: (e: Array<{ isIntersecting: boolean }>) => void = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: typeof fire) {
          fire = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    function Harness() {
      const ref = useRef<HTMLDivElement>(null);
      return (
        <>
          <div ref={ref} />
          <StickyPatientHeader name="x" hn="HN1" an="69000123" laborStatus="ACTIVE" hospitalName="รพ.น่าน" mainHeaderRef={ref} />
        </>
      );
    }
    const { container } = render(<Harness />);
    act(() => fire([{ isIntersecting: false }]));
    const bar = screen.getByRole('region', { name: 'แถบข้อมูลผู้คลอดย่อ' });
    expect(bar).toHaveTextContent('AN 69000123');
    const anchor = bar.parentElement!;
    expect(anchor.className).toContain('sticky');
    expect(anchor.className).toContain('top-[var(--app-header-h,0px)]');
    expect(anchor.className).toContain('h-0');
    expect(container.innerHTML).not.toContain('fixed');
    expect(container.querySelector('header.sticky')).toBeNull(); // kiosk CSS must not catch it
    vi.unstubAllGlobals();
  });
});

describe('ReferralBanner on tokens', () => {
  it('HIGH uses the risk tint and accent from RISK_LEVELS', () => {
    render(<ReferralBanner score={12} riskLevel={RiskLevel.HIGH} recommendation="ส่งต่อ" />);
    const banner = screen.getByRole('alert');
    expect(banner.style.backgroundColor).toBe(hexToRgb(COLOR.riskHighTint));
    expect(banner.style.borderLeftColor).toBe(hexToRgb(COLOR.riskHigh));
  });
});

describe('Thai labels replace English captions', () => {
  it('QuickStatsBar sits in the shared KpiGrid and has no English captions', () => {
    const { container } = render(
      <QuickStatsBar
        age={28}
        gravida={2}
        gaWeeks={39}
        ancCount={6}
        admitDate={new Date().toISOString()}
        laborStatus="ACTIVE"
        currentDilationCm={null}
        latestVitalAt={null}
      />,
    );
    expect((container.firstChild as HTMLElement).className).toContain('grid-cols-[repeat(auto-fit,minmax(200px,1fr))]');
    for (const en of ['AGE', 'OB FORMULA', 'LABOR TIME', 'CERVIX', 'LAST VITAL', 'STALE', 'wk']) {
      expect(screen.queryByText(en)).toBeNull();
    }
    expect(screen.getByText('สัญญาณชีพล่าสุด')).toBeInTheDocument();
  });

  it.each([
    [33, 'border-l-danger'],
    [36, 'border-l-warn'],
    [39, 'border-l-ok'],
    [42, 'border-l-danger'],
    [null, 'border-l-ink-subtle'],
  ] as const)('QuickStatsBar GA %s → %s (tone from classifyGaTerm)', (ga, accent) => {
    render(
      <QuickStatsBar
        age={28}
        gravida={2}
        gaWeeks={ga}
        ancCount={6}
        admitDate={new Date().toISOString()}
        laborStatus="ACTIVE"
        currentDilationCm={null}
        latestVitalAt={null}
      />,
    );
    expect(screen.getByText('อายุครรภ์').parentElement!.className).toContain(accent);
  });

  it('ClinicalData: Thai severity badges, no English captions', () => {
    render(<ClinicalData gravida={1} gaWeeks={33} ancCount={2} heightCm={140} weightDiffKg={25} fundalHeightCm={38} usWeightG={3800} hematocritPct={28} />);
    expect(screen.getAllByText('ผิดปกติ').length).toBeGreaterThan(0);
    for (const en of ['ALERT', 'WARN', 'OB FORMULA', 'HEIGHT', 'US WEIGHT', 'HCT', 'Very Preterm', 'ADMISSION SNAPSHOT']) {
      expect(screen.queryByText(new RegExp(en))).toBeNull();
    }
    expect(screen.getByText(/ก่อนกำหนดมาก/)).toBeInTheDocument();
  });

  it('CurrentVitalsPanel tints come from tokens, not color-mix hex', () => {
    const { container } = render(
      <CurrentVitalsPanel
        vitals={[{ measuredAt: new Date().toISOString(), maternalHr: 130, fetalHr: null, sbp: null, dbp: null, pphAmountMl: null }]}
      />,
    );
    expect(container.innerHTML).not.toContain('color-mix');
    expect(screen.getByText('ชีพจรมารดา').closest('[data-vital-tile]')!.className).toContain('bg-danger-tint');
  });
});

