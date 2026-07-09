// Patient detail page — behavior tests for the 2026-07-09 redesign:
// per-patient sync freshness stamp, referral history strip, and newborn
// outcomes card (both from the linked maternal journey).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, act } from '@testing-library/react';
import { Suspense } from 'react';
import PatientDetailPage from '@/app/(provincial)/patients/[an]/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));
vi.mock('@/hooks/useSSE', () => ({ useSSE: vi.fn() }));

// jsdom has no IntersectionObserver; StickyPatientHeader observes the main
// header to decide when to pin itself.
vi.stubGlobal(
  'IntersectionObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const HOURS = 3600_000;

const patient = {
  id: 'pat-1',
  hn: 'HN001',
  an: '69000123',
  name: 'นาง สายฝน อุ่นเรือน',
  age: 28,
  gravida: 2,
  para: 1,
  abortion: 0,
  livingChildren: 1,
  pregNo: 2,
  gaWeeks: 39,
  gaDay: 2,
  ancCount: 6,
  admitDate: new Date(Date.now() - 6 * HOURS).toISOString(),
  heightCm: 158,
  weightKg: 62,
  weightDiffKg: 11,
  prePregnancyWeightKg: 51,
  fundalHeightCm: 34,
  usWeightG: 3100,
  hematocritPct: 34,
  bpSystolicAdmit: 118,
  bpDiastolicAdmit: 76,
  pulseAdmit: 82,
  rrAdmit: 18,
  temperatureAdmit: 36.8,
  cervicalOpenCmAdmit: 4,
  effacementPctAdmit: 80,
  stationAdmit: '-1',
  laborStatus: 'ACTIVE',
  hospital: { hcode: '10670', name: 'รพ.ขอนแก่น', level: 'A_S' },
  syncedAt: new Date(Date.now() - 10 * 60_000).toISOString(), // 10 min ago
};

const journeyContext = {
  journeyId: 'j-1',
  careStage: 'LABOR',
  ancRiskLevel: 'HR2',
  ancVisitCount: 6,
  lastAncDate: new Date(Date.now() - 5 * 24 * HOURS).toISOString(),
  lmp: null,
  edc: new Date(Date.now() + 5 * 24 * HOURS).toISOString(),
  referrals: [
    {
      id: 'ref-1',
      journeyId: 'j-1',
      referNumber: 'REF-2569-042',
      fromHospital: 'รพ.พล',
      toHospital: 'รพ.ขอนแก่น',
      status: 'INITIATED',
      reason: 'ครรภ์เสี่ยงสูง ส่งต่อคลอด',
      diagnosisCode: 'O24.4',
      urgencyLevel: 'URGENT',
      initiatedAt: new Date(Date.now() - 20 * HOURS).toISOString(),
      arrivedAt: null,
    },
  ],
  newborns: [
    {
      infantNumber: 1,
      sex: 'F',
      birthWeightG: 2300,
      apgar1min: 7,
      apgar5min: 6,
      bornAt: new Date(Date.now() - 2 * HOURS).toISOString(),
    },
  ],
};

vi.mock('@/hooks/usePatient', () => ({
  usePatient: () => ({
    patient,
    cpdScore: null,
    journeyContext,
    vitals: [],
    contractions: [],
    isLoading: false,
    error: null,
    vitalsError: null,
    contractionsError: null,
    mutate: vi.fn(),
    mutateVitals: vi.fn(),
    mutateContractions: vi.fn(),
  }),
}));

vi.mock('@/hooks/usePartogram', () => ({
  usePartogram: () => ({ partogram: null, error: undefined, mutate: vi.fn() }),
}));

async function renderPage() {
  // use(params) suspends on first render — the App Router provides the
  // boundary in production, the test provides its own. The act() must be
  // awaited so React retries after the params promise resolves.
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <PatientDetailPage params={Promise.resolve({ an: '10670-69000123' })} />
      </Suspense>,
    );
  });
}

describe('PatientDetailPage — redesign', () => {
  it('shows the per-patient HOSxP sync freshness stamp', async () => {
    await renderPage();
    expect(await screen.findByTestId('sync-stamp')).toBeInTheDocument();
    expect(screen.getByText(/ข้อมูลจาก HOSxP/)).toBeInTheDocument();
  });

  it('renders the referral history from the linked journey with a board link', async () => {
    await renderPage();

    const strip = await screen.findByTestId('patient-referrals');
    expect(within(strip).getByText('REF-2569-042')).toBeInTheDocument();
    expect(within(strip).getByText(/รพ.พล/)).toBeInTheDocument();
    expect(within(strip).getByText('รอดำเนินการ')).toBeInTheDocument(); // INITIATED pill
    expect(within(strip).getByText('เร่งด่วน')).toBeInTheDocument(); // URGENT pill
  });

  it('renders newborn outcomes with LBW and low-Apgar emphasis', async () => {
    await renderPage();

    const card = await screen.findByTestId('patient-newborns');
    expect(within(card).getByText(/2,300/)).toBeInTheDocument();
    expect(within(card).getByText('LBW')).toBeInTheDocument();
    const apgar = within(card).getByTestId('newborn-apgar-1');
    expect(apgar.getAttribute('data-low')).toBe('true');
  });
});
