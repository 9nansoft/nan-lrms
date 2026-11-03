// Outcomes board page — behavior tests for the redesigned neonatal view.
// KPIs must render the API payload faithfully (percent LBW!), the range and
// hospital filters must hit the API, names stay masked, and an empty table
// states honestly that no sync data exists yet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { failNextRefresh } from '../../helpers/swr-stale';
import type { OutcomesResponse } from '@/types/api';
import OutcomesPage from '@/app/(provincial)/outcomes/page';
import { NEWBORN_THRESHOLDS } from '@/config/newborn';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  usePathname: () => '/outcomes',
}));

function makeFixture(): OutcomesResponse {
  return {
    totalBirths: 48,
    lbwCount: 6,
    lbwRate: 12.5,
    lowApgarCount: 2,
    // Deliberately not 2/totalBirths: the tile must show the server's rate.
    lowApgarRate: 9.9,
    avgBirthWeightG: 3050,
    multiples: 3,
    resuscitated: 4,
    trend: [
      { month: '2026-02', births: 30, lbw: 3 },
      { month: '2026-03', births: 41, lbw: 5 },
      { month: '2026-04', births: 38, lbw: 4 },
      { month: '2026-05', births: 45, lbw: 6 },
      { month: '2026-06', births: 52, lbw: 7 },
      { month: '2026-07', births: 48, lbw: 6 },
    ],
    byHospital: [
      { id: 'h-kkh', hcode: '10670', name: 'รพ.น่าน', births: 30, lbw: 4, lowApgar: 2 },
      { id: 'h-chumphae', hcode: '10998', name: 'รพ.ชุมแพ', births: 18, lbw: 2, lowApgar: 0 },
    ],
    recent: [
      {
        id: 'nb-1',
        journeyId: 'j-1',
        motherName: 'นาง สายฝน อุ่นเรือน',
        hospitalName: 'รพ.น่าน',
        infantNumber: 2,
        sex: 'F',
        birthWeightG: 2300,
        apgar1min: 7,
        apgar5min: 6,
        resuscitated: true,
        bornAt: new Date().toISOString(),
      },
    ],
  };
}

function renderPage(data: OutcomesResponse = makeFixture()) {
  const fetcher = vi.fn(async (_url: string) => data);
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <OutcomesPage />
    </SWRConfig>,
  );
  return { fetcher, ...utils };
}

describe('OutcomesPage — KPI tiles', () => {
  it('renders all six KPIs from the payload with a correct LBW percentage', async () => {
    renderPage();

    const total = await screen.findByTestId('kpi-total');
    expect(within(total).getByText('48')).toBeInTheDocument();

    const lbw = screen.getByTestId('kpi-lbw');
    expect(within(lbw).getByText('6')).toBeInTheDocument();
    expect(within(lbw).getByText(/12\.5%/)).toBeInTheDocument();

    expect(within(screen.getByTestId('kpi-apgar')).getByText('2')).toBeInTheDocument();
    // Same sub-line shape as the LBW tile so card heights match.
    expect(within(screen.getByTestId('kpi-apgar')).getByText(/9\.9% ของทารกทั้งหมด/)).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-multiples')).getByText('3')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-resus')).getByText('4')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-avg-weight')).getByText('3,050')).toBeInTheDocument();
  });

  it('defaults to month-to-date and switches ranges via chips', async () => {
    const { fetcher } = renderPage();

    await screen.findByTestId('kpi-total');
    let urls = fetcher.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('range=mtd'))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /30 วัน/ }));
    await waitFor(() => {
      urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('range=30d'))).toBe(true);
    });
  });

  it('filters by hospital from the byHospital facet', async () => {
    const { fetcher } = renderPage();

    const select = await screen.findByTestId('filter-hospital');
    expect(within(select).getByText(/รพ.น่าน \(30\)/)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'h-kkh' } });
    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('hospital_id=h-kkh'))).toBe(true);
    });
  });

  it('offers a clear-filter button once a hospital is chosen and resets the hospital filter', async () => {
    const { fetcher } = renderPage();
    expect(screen.queryByRole('button', { name: 'ล้างตัวกรอง' })).toBeNull();
    fireEvent.change(await screen.findByTestId('filter-hospital'), { target: { value: 'h-kkh' } });
    fireEvent.click(await screen.findByRole('button', { name: 'ล้างตัวกรอง' }));
    await waitFor(() => expect((screen.getByTestId('filter-hospital') as HTMLSelectElement).value).toBe(''));
    expect(fetcher.mock.calls.length).toBeGreaterThan(1);
  });

  it('shows a status EmptyState (not a bare cell) when the hospital table has no rows', async () => {
    renderPage({ ...makeFixture(), byHospital: [] });
    const section = await screen.findByTestId('hospital-outcomes');
    expect(within(section).getByRole('status')).toHaveTextContent('ไม่มีข้อมูลในช่วงที่เลือก');
  });

  it('shows a last-updated stamp', async () => {
    renderPage();
    expect(await screen.findByText(/ข้อมูลหน้านี้ ณ/)).toBeInTheDocument();
  });
});

describe('OutcomesPage — trend and breakdown', () => {
  it('renders the six-month trend and the hospital breakdown table', async () => {
    renderPage();

    const trend = await screen.findByTestId('outcome-trend');
    expect(within(trend).getByText('52')).toBeInTheDocument(); // June births

    const table = screen.getByTestId('hospital-outcomes');
    const kkh = within(table).getByTestId('hospital-outcome-10670');
    expect(within(kkh).getByText('30')).toBeInTheDocument();
    expect(within(kkh).getByText(/13\.3%/)).toBeInTheDocument(); // 4/30 LBW
  });
});

describe('OutcomesPage — recent births', () => {
  it('masks the mother name, flags LBW and low Apgar, links to the journey', async () => {
    renderPage();

    const row = await screen.findByTestId('birth-row-nb-1');
    expect(within(row).getByText(/นาง สายฝน อ\./)).toBeInTheDocument();
    expect(screen.queryByText(/อุ่นเรือน/)).toBeNull();
    expect(within(row).getByText('LBW')).toBeInTheDocument();
    expect(within(row).getByText(/กู้ชีพ/)).toBeInTheDocument();
    expect(within(row).getByRole('link')).toHaveAttribute('href', '/pregnancies/j-1');
    fireEvent.click(row);
    expect(nav.push).toHaveBeenCalledWith('/pregnancies/j-1');
    expect(row.getAttribute('data-low-apgar')).toBe('true');
  });

  it('states honestly that no sync data exists yet when the table is empty', async () => {
    renderPage({
      ...makeFixture(),
      totalBirths: 0,
      lbwCount: 0,
      lbwRate: 0,
      lowApgarCount: 0,
      avgBirthWeightG: 0,
      multiples: 0,
      resuscitated: 0,
      trend: makeFixture().trend.map((t) => ({ ...t, births: 0, lbw: 0 })),
      byHospital: [],
      recent: [],
    });

    expect(await screen.findByText(/ยังไม่มีข้อมูลทารกจากการซิงค์/)).toBeInTheDocument();
  });
});

describe('OutcomesPage — list-page pattern (sub-project 4)', () => {
  it('Thai header, filters and sections; no English mono labels', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'ผลลัพธ์ทารก' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'ช่วงเวลา' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'การเกิดล่าสุด' })).toBeInTheDocument();
    for (const en of ['PROVINCIAL REGISTRY', 'TOTAL BIRTHS', 'LOW BIRTH WEIGHT', 'Recent births', 'BIRTHS · LAST 6 MONTHS', 'BY HOSPITAL', 'PERIOD:', 'HOSPITAL:']) {
      expect(screen.queryByText(new RegExp(en))).toBeNull();
    }
  });

  it('LBW and Apgar labels quote NEWBORN_THRESHOLDS', async () => {
    renderPage();
    expect(await screen.findByTestId('kpi-lbw')).toHaveTextContent(NEWBORN_THRESHOLDS.lbwGrams.toLocaleString('en-US'));
    expect(screen.getByTestId('kpi-apgar')).toHaveTextContent(`< ${NEWBORN_THRESHOLDS.apgarLowAt5min}`);
  });

  it('recent-births header states the subset against totalBirths', async () => {
    renderPage();
    const recent = await screen.findByRole('region', { name: 'การเกิดล่าสุด' });
    expect(within(recent).getByText(/จาก 48 ราย/)).toBeInTheDocument();
  });
});

describe('OutcomesPage — stale data', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps the cached figures and shows the stale banner when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetcher } = renderPage();
    expect((await screen.findAllByText(/รพ.น่าน/)).length).toBeGreaterThan(0);
    await failNextRefresh(fetcher);
    expect(await screen.findByText(/การเชื่อมต่อล้มเหลว/)).toBeInTheDocument();
    expect(screen.getAllByText(/รพ.น่าน/).length).toBeGreaterThan(0);
  });
});
