// Journey detail page — behavior tests for the 2026-07-09 redesign:
// HOSxP sync freshness stamp, labor-admission cross-link, Thai risk-rule
// labels (instead of raw rule IDs), and the high-risk history panel.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { Suspense } from 'react';
import { SWRConfig } from 'swr';
import JourneyDetailPage from '@/app/(provincial)/pregnancies/[journeyId]/page';
import { ANC_RISK_RULES } from '@/config/anc-risk-rules';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('@/hooks/useSSE', () => ({ useSSE: vi.fn() }));

const HOURS = 3600_000;

const fixture = {
  journey: {
    id: 'j-detail-1',
    hn: 'HN001',
    name: 'นาง ใจดี ทดสอบ',
    age: 32,
    gravida: 2,
    para: 1,
    gaWeeks: 39,
    lmp: null,
    edc: new Date(Date.now() + 7 * 24 * HOURS).toISOString(),
    careStage: 'LABOR',
    ancRiskLevel: 'HR2',
    ancVisitCount: 6,
    lastAncDate: new Date(Date.now() - 10 * 24 * HOURS).toISOString(),
    hospitalName: 'รพ.พล',
    hcode: '10995',
    registeredAt: new Date(Date.now() - 200 * 24 * HOURS).toISOString(),
    currentHospitalName: 'รพ.ขอนแก่น',
    currentHcode: '10670',
    heightCm: 158,
    bloodGroup: 'O',
    rhFactor: 'POS',
    hbsagResult: 'NEG',
    vdrlResult: 'NEG',
    hivResult: 'NEG',
    ogttResult: null,
    termBirths: 1,
    pretermBirths: 0,
    abortions: 0,
    livingChildren: 1,
    pastMedicalHistory: null,
    mcvFl: null,
    dcipResult: null,
    hbEResult: null,
    thalassemiaType: null,
    cervicalScreenType: null,
    cervicalScreenResult: null,
    cervicalScreenDate: null,
    aneuploidyMethod: null,
    aneuploidyResult: null,
    gbsResult: null,
    gbsCollectedDate: null,
    anatomyScanDate: null,
    anatomyScanResult: null,
    efwG: null,
    datingMethod: null,
    proteinuria24hMg: 350,
    creatinineMgDl: null,
    priorPeDvt: true,
    severeLungDisease: null,
    alloimmunizationCde: null,
    bariatricSurgeryHx: null,
    teratogenExposure: null,
    congenitalInfection: null,
    gdmRiskFactors: ['obesity'],
    syncedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
  },
  ancVisits: [],
  latestRisk: {
    riskLevel: 'HR2',
    triggeredRules: ['hr1_previous_lbw'],
    screenedAt: new Date(Date.now() - 30 * 24 * HOURS).toISOString(),
    recommendedFacility: null,
  },
  referrals: [],
  newborns: [],
  laborAdmission: {
    an: '69000123',
    hcode: '10670',
    laborStatus: 'ACTIVE',
    admitDate: new Date(Date.now() - 6 * HOURS).toISOString(),
  },
};

async function renderPage() {
  await act(async () => {
    render(
      <SWRConfig
        value={{
          fetcher: async (_url: string) => fixture,
          provider: () => new Map(),
          dedupingInterval: 0,
        }}
      >
        <Suspense fallback={null}>
          <JourneyDetailPage params={Promise.resolve({ journeyId: 'j-detail-1' })} />
        </Suspense>
      </SWRConfig>,
    );
  });
}

// WHO containment T1 — unknown-state observation severities. Missing
// clinical data must be a distinct "unknown" state: never the green OK
// badge, and a known abnormal finding (BP sys 200) must still flag red
// even when its sibling (diastolic) is missing.
const baseVisit = {
  hospitalName: 'รพ.พล',
  hcode: '10995',
  fundalHeightCm: null,
  weightKg: null,
  presentation: null,
  engagement: null,
  passQuality: null,
  urineProtein: null,
  urineGlucose: null,
  hctPct: null,
  ttDoseNo: null,
  ironFolicGiven: null,
  calciumGiven: null,
  dangerSigns: null,
};

const visitAllNull = {
  ...baseVisit,
  visitDate: new Date(Date.now() - 30 * 24 * HOURS).toISOString(),
  visitNumber: 1,
  gaWeeks: 12,
  bpSystolic: null,
  bpDiastolic: null,
  fetalHr: null,
  hbGDl: null,
  fetalMovementOk: null,
};

const visitBpAbnormalPartial = {
  ...baseVisit,
  visitDate: new Date(Date.now() - 10 * 24 * HOURS).toISOString(),
  visitNumber: 2,
  gaWeeks: 20,
  bpSystolic: 200,
  bpDiastolic: null,
  fetalHr: 140,
  hbGDl: 12,
  fetalMovementOk: true,
};

const fixtureWithVisits = {
  ...fixture,
  ancVisits: [visitAllNull, visitBpAbnormalPartial],
};

async function renderPageWithVisits() {
  await act(async () => {
    render(
      <SWRConfig
        value={{
          fetcher: async (_url: string) => fixtureWithVisits,
          provider: () => new Map(),
          dedupingInterval: 0,
        }}
      >
        <Suspense fallback={null}>
          <JourneyDetailPage params={Promise.resolve({ journeyId: 'j-detail-1' })} />
        </Suspense>
      </SWRConfig>,
    );
  });
}

describe('JourneyDetailPage — redesign', () => {
  it('shows the HOSxP sync freshness stamp', async () => {
    await renderPage();
    expect(await screen.findByTestId('sync-stamp')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลจาก HOSxP/)).toBeInTheDocument();
  });

  it('cross-links to the labor admission when one exists', async () => {
    await renderPage();
    const link = await screen.findByTestId('labor-admission-link');
    expect(link.getAttribute('href')).toBe('/patients/10670-69000123');
  });

  it('renders triggered risk rules as Thai labels, not raw rule IDs', async () => {
    await renderPage();
    const rule = ANC_RISK_RULES.find((r) => r.id === 'hr1_previous_lbw')!;
    expect((await screen.findAllByText(rule.labelTh)).length).toBeGreaterThan(0);
    expect(screen.queryByText('hr1_previous_lbw')).toBeNull();
  });

  it('surfaces the high-risk history panel (PE/DVT, proteinuria, GDM factors)', async () => {
    await renderPage();
    const panel = await screen.findByTestId('high-risk-history');
    expect(within(panel).getByText(/PE\/DVT/)).toBeInTheDocument();
    expect(within(panel).getByText(/350/)).toBeInTheDocument();
    expect(within(panel).getByText(/obesity/)).toBeInTheDocument();
  });
});

describe('JourneyDetailPage — unknown-state observation severities (WHO containment T1)', () => {
  it('never shows the green OK badge for a visit whose clinical fields are all missing, and shows the not-fully-recorded badge instead', async () => {
    await renderPageWithVisits();
    // "OK" only ever appears as the fully-known-good visit badge on this
    // page; asserting its total absence proves the all-null visit did not
    // fall through to the green check.
    expect(screen.queryByText('OK')).toBeNull();
    expect(await screen.findByText('ไม่ได้บันทึกครบ')).toBeInTheDocument();
  });

  it('still fires the red BP-high flag when systolic is abnormal even though diastolic is missing', async () => {
    await renderPageWithVisits();
    expect(await screen.findByText('BP HIGH')).toBeInTheDocument();
  });
});
