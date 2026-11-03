// tests/unit/components/patient/patient-panels.characterization.test.tsx
/* @vitest-environment jsdom */
// Characterization of the patient-detail panels that had no tests, written
// BEFORE the sub-project 3 restyle. Behaviour assertions stay unedited; Task 6
// changes COPY values only.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { CurrentVitalsPanel } from '@/components/patient/CurrentVitalsPanel';
import { LaborProgressCard } from '@/components/patient/LaborProgressCard';
import { QuickStatsBar } from '@/components/patient/QuickStatsBar';
import { CpdFactorBreakdown } from '@/components/patient/CpdFactorBreakdown';
import { CPD_FACTOR_WEIGHTS } from '@/config/risk-levels';

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

const COPY = {
  vitalTile: (label: string) => screen.getByText(label).closest('[data-vital-tile]') as HTMLElement,
  emptyVitalTile: (label: string) => screen.getByText(label).closest('[data-vital-tile]') as HTMLElement,
  criticalCount: (n: number) => `ผิดปกติ ${n} รายการ`,
  phase: { latent: 'ระยะแฝง', active: 'ระยะเร่ง', transition: 'ระยะเปลี่ยนผ่าน' },
  sub: (text: string) => `· ${text}`,
  gaTerm: 'ครบกำหนด',
  cervixPhaseActive: 'ระยะเร่ง',
  vitalStale: 'ข้อมูลเก่า',
  cpdRiskLine: 'เสี่ยงสูง',
  cpdTotal: (score: number, max: number) => `คะแนนรวม ${score} / ${max}`,
  cpdFooterTag: 'คะแนน CPD · จังหวัดน่าน',
};

describe('CurrentVitalsPanel — characterization', () => {
  it('classifies each vital with the existing thresholds and counts criticals', () => {
    render(
      <CurrentVitalsPanel
        vitals={[{ measuredAt: ago(0.2), maternalHr: 130, fetalHr: '150', sbp: 150, dbp: 95, pphAmountMl: null }]}
      />,
    );
    expect(within(COPY.vitalTile('ชีพจรมารดา')).getByText('ผิดปกติ')).toBeInTheDocument(); // 130 > 120
    expect(within(COPY.vitalTile('ชีพจรทารก')).getByText('ปกติ')).toBeInTheDocument(); // 110–160
    expect(within(COPY.vitalTile('ความดันโลหิต')).getByText('เฝ้าระวัง')).toBeInTheDocument(); // 150/95
    expect(within(COPY.emptyVitalTile('เลือดออกหลังคลอด')).getByText('ไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.getByText(COPY.criticalCount(1))).toBeInTheDocument();
    expect(screen.getByText('130')).toBeInTheDocument();
    expect(screen.getByText('150/95')).toBeInTheDocument();
    expect(screen.getByText('ปกติ: 60-100 bpm')).toBeInTheDocument();
  });
});

describe('LaborProgressCard — characterization', () => {
  it('shows the phase, dilation rate, UC intensity and alert-line crossing', () => {
    render(
      <LaborProgressCard
        admitDate={ago(5)}
        laborStatus="ACTIVE"
        partogramEntries={[
          { measuredAt: ago(3), dilationCm: 4, alertLineCm: null, actionLineCm: null },
          { measuredAt: ago(1), dilationCm: 6, alertLineCm: 5, actionLineCm: 8 },
        ]}
        contractions={[{ measuredAt: ago(1), intervalMin: 3, durationSec: 45, intensity: 'STRONG' }]}
      />,
    );
    expect(screen.getByText(COPY.phase.active)).toBeInTheDocument();
    expect(screen.getByText('1.0')).toBeInTheDocument(); // (6 − 4) cm / 2 h
    expect(screen.getByText('รุนแรง')).toBeInTheDocument();
    expect(screen.getByText('เกินเส้นเตือน — พิจารณาเฝ้าระวังใกล้ชิด')).toBeInTheDocument();
    expect(screen.queryByText('เกินเส้นปฏิบัติ — ควรพิจารณาดำเนินการ')).toBeNull();
  });

  it.each([
    [3, 'latent'],
    [7, 'active'],
    [8, 'transition'],
  ] as const)('dilation %s cm → %s phase (card cut-offs ≤3 / ≤7 / >7)', (cm, phase) => {
    render(
      <LaborProgressCard
        admitDate={ago(2)}
        laborStatus="ACTIVE"
        partogramEntries={[{ measuredAt: ago(1), dilationCm: cm, alertLineCm: null, actionLineCm: null }]}
        contractions={[]}
      />,
    );
    expect(screen.getByText(COPY.phase[phase])).toBeInTheDocument();
  });

  it('empty partogram shows the empty message', () => {
    render(<LaborProgressCard admitDate={ago(2)} laborStatus="ACTIVE" partogramEntries={null} contractions={[]} />);
    expect(screen.getByText('ยังไม่มีข้อมูลการขยายปากมดลูก')).toBeInTheDocument();
  });
});

describe('QuickStatsBar — characterization', () => {
  it('formats G P A L, GA with days, term band, cervix phase and a missing vital', () => {
    render(
      <QuickStatsBar
        age={28}
        gravida={2}
        para={1}
        abortion={0}
        livingChildren={1}
        gaWeeks={39}
        gaDay={2}
        ancCount={6}
        admitDate={ago(3)}
        laborStatus="ACTIVE"
        currentDilationCm={6}
        latestVitalAt={null}
      />,
    );
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.getByText('G2 P1 A0 L1')).toBeInTheDocument();
    expect(screen.getByText('39⁺2')).toBeInTheDocument();
    expect(screen.getByText(COPY.sub(COPY.gaTerm))).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(COPY.sub(COPY.cervixPhaseActive))).toBeInTheDocument();
    expect(screen.getByText('ไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.getByText(COPY.sub(COPY.vitalStale))).toBeInTheDocument();
    expect(screen.getByText(/3ชม/)).toBeInTheDocument();
  });
});

describe('CpdFactorBreakdown — characterization', () => {
  it('renders every factor with its stored contribution and the missing count', () => {
    render(
      <CpdFactorBreakdown
        score={11.5}
        riskLevel="HIGH"
        factors={{
          gravida: 2,
          ancCount: 1.5,
          gaWeeks: 0,
          heightCm: 2,
          weightDiffKg: 1,
          fundalHeightCm: 2,
          usWeightG: 2,
          hematocritPct: null,
        }}
        missingFactors={['hematocritPct']}
        calculatedAt={new Date().toISOString()}
      />,
    );
    for (const w of Object.values(CPD_FACTOR_WEIGHTS)) expect(screen.getByText(w.nameTh)).toBeInTheDocument();
    expect(screen.getAllByText('+2/2')).toHaveLength(4);
    expect(screen.getByText('+1.5/1.5')).toBeInTheDocument();
    expect(screen.getByText('+0/1.5')).toBeInTheDocument();
    expect(screen.getByText('+1/2')).toBeInTheDocument();
    expect(screen.getByText('1 ไม่มีข้อมูล')).toBeInTheDocument();
    expect(screen.getByText(COPY.cpdRiskLine)).toBeInTheDocument();
    expect(screen.getByText(COPY.cpdTotal(11.5, 14.5))).toBeInTheDocument();
    expect(screen.getByText(COPY.cpdFooterTag)).toBeInTheDocument();
  });
});
