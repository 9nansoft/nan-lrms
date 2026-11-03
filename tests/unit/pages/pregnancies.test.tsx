// Pregnancies board page — behavior tests for the redesigned provincial view.
// KPI strips must come from the API's DB-wide counts, EDC/due and follow-up
// aging must render per anc-ops config, and patient identity stays masked.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { failNextRefresh } from '../../helpers/swr-stale';
import type { JourneyListResponse } from '@/types/api';
import PregnanciesPage from '@/app/(provincial)/pregnancies/page';
import { ANC_LAST_VISIT_MAX_AGE_DAYS } from '@/config/anc-freshness';
import { ANC_OPS } from '@/config/anc-ops';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  usePathname: () => '/pregnancies',
}));

// jsdom has no EventSource; the page only uses SSE to trigger refreshes.
vi.mock('@/hooks/useSSE', () => ({ useSSE: vi.fn() }));

const DAY = 24 * 3600_000;

function iso(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * DAY).toISOString();
}

function makeFixture(): JourneyListResponse {
  return {
    journeys: [
      {
        id: 'j-overdue',
        hn: 'HN001234',
        name: 'นาง สายฝน อุ่นเรือน',
        age: 17,
        gravida: 1,
        para: 0,
        gaWeeks: 40,
        lmp: null,
        edc: iso(-2), // past EDC — overdue
        careStage: 'PREGNANCY',
        ancRiskLevel: 'HR3',
        ancVisitCount: 3,
        lastAncDate: iso(-52), // past critical threshold — near LTFU
        hospitalName: 'รพ.ชุมแพ',
        hcode: '10998',
        registeredAt: iso(-200),
      },
      {
        id: 'j-warn',
        hn: 'HN555003',
        name: 'นาง มะลิ ทองคำ',
        age: 36,
        gravida: 3,
        para: 2,
        gaWeeks: 30,
        lmp: null,
        edc: iso(70),
        careStage: 'PREGNANCY',
        ancRiskLevel: 'HR1',
        ancVisitCount: 4,
        lastAncDate: iso(-40), // warn window
        hospitalName: 'รพ.น้ำพอง',
        hcode: '11000',
        registeredAt: iso(-150),
      },
      {
        id: 'j-ok',
        hn: 'HN888002',
        name: 'น.ส. จันทร์เพ็ญ ดีงาม',
        age: 28,
        gravida: 1,
        para: 0,
        gaWeeks: 20,
        lmp: null,
        edc: iso(140),
        careStage: 'PREGNANCY',
        ancRiskLevel: 'LOW',
        ancVisitCount: 2,
        lastAncDate: iso(-10),
        hospitalName: 'รพ.น้ำพอง',
        hcode: '11000',
        registeredAt: iso(-100),
      },
    ],
    pagination: { total: 1169, page: 1, perPage: 20, totalPages: 59 },
    counts: { low: 814, hr1: 121, hr2: 128, hr3: 106, total: 1169 },
    opsCounts: {
      dueSoon: 172,
      overdueEdc: 92,
      ancStale: 138,
      lowVisits: 119,
      nearTerm: 218,
      ltfu: 57,
    },
    hospitalCounts: [
      { id: 'h-chumphae', name: 'รพ.ชุมแพ', count: 83 },
      { id: 'h-numphong', name: 'รพ.น้ำพอง', count: 40 },
    ],
  };
}

function renderPage(data: JourneyListResponse = makeFixture()) {
  const fetcher = vi.fn(async (_url: string) => data);
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <PregnanciesPage />
    </SWRConfig>,
  );
  return { fetcher, ...utils };
}

/** KPI toggles are stretched aria-pressed buttons inside the tile (the
 *  tile root carries the test id). */
const toggleIn = (tile: HTMLElement) => within(tile).getByRole('button', { pressed: false });

describe('PregnanciesPage — KPI strips', () => {
  it('renders ops cohorts from opsCounts with counts, not from visible rows', async () => {
    renderPage();

    const dueSoon = await screen.findByTestId('kpi-due-soon');
    expect(within(dueSoon).getByText('172')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-overdue-edc')).getByText('92')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-anc-stale')).getByText('138')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-low-visits')).getByText('119')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-near-term')).getByText('218')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-ltfu')).getByText('57')).toBeInTheDocument();
  });

  it('clicking a cohort KPI applies the cohort filter', async () => {
    const { fetcher } = renderPage();

    fireEvent.click(toggleIn(await screen.findByTestId('kpi-due-soon')));

    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('cohort=due_soon'))).toBe(true);
    });
  });

  it('clicking the LTFU cell requests the lost-to-follow-up worklist', async () => {
    const { fetcher } = renderPage();

    fireEvent.click(toggleIn(await screen.findByTestId('kpi-ltfu')));

    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('cohort=ltfu'))).toBe(true);
    });
  });

  it('risk strip cells are clickable filters fed by DB-wide counts', async () => {
    const { fetcher } = renderPage();

    const hr3 = await screen.findByTestId('risk-HR3');
    expect(within(hr3).getByText('106')).toBeInTheDocument();

    fireEvent.click(toggleIn(hr3));
    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('risk_level=HR3'))).toBe(true);
    });
  });

  it('shows a last-updated stamp and the gating footnote', async () => {
    renderPage();
    expect(await screen.findByText(/ข้อมูลหน้านี้ ณ/)).toBeInTheDocument();
    expect(screen.getByText(/ไม่รวมราย/)).toBeInTheDocument();
  });
});

describe('PregnanciesPage — rows', () => {
  it('classifies EDC due state and last-ANC follow-up per anc-ops thresholds', async () => {
    renderPage();

    const overdueRow = await screen.findByTestId('journey-row-j-overdue');
    expect(overdueRow.getAttribute('data-due')).toBe('overdue');
    expect(within(overdueRow).getByText(/เกินกำหนด/)).toBeInTheDocument();
    // 52 days since last ANC → critical (near lost-to-follow-up).
    expect(overdueRow.getAttribute('data-followup')).toBe('critical');
    expect(within(overdueRow).getByText(/ใกล้หลุดติดตาม/)).toBeInTheDocument();

    const warnRow = screen.getByTestId('journey-row-j-warn');
    expect(warnRow.getAttribute('data-followup')).toBe('warn');

    const okRow = screen.getByTestId('journey-row-j-ok');
    expect(okRow.getAttribute('data-due')).toBe('ok');
    expect(okRow.getAttribute('data-followup')).toBe('ok');
  });

  it('flags teen and advanced-maternal-age pregnancies', async () => {
    renderPage();

    expect((await screen.findByTestId('journey-row-j-overdue')).getAttribute('data-age-flag')).toBe(
      'teen',
    );
    expect(screen.getByTestId('journey-row-j-warn').getAttribute('data-age-flag')).toBe('ama');
    expect(screen.getByTestId('journey-row-j-ok').getAttribute('data-age-flag')).toBeNull();
  });

  it('masks patient names — the full surname never reaches the DOM', async () => {
    renderPage();

    expect((await screen.findAllByText(/นาง สายฝน อ\./)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/อุ่นเรือน/)).toBeNull();
  });
});

describe('PregnanciesPage — sort and hospital filter', () => {
  it('defaults to due-soonest ordering and supports switching', async () => {
    const { fetcher } = renderPage();

    const select = await screen.findByTestId('sort-select');
    expect((select as HTMLSelectElement).value).toBe('due');
    let urls = fetcher.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes('sort=due'))).toBe(true);

    fireEvent.change(select, { target: { value: 'last_anc' } });
    await waitFor(() => {
      urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('sort=last_anc'))).toBe(true);
    });
  });

  it('lists hospitals from hospitalCounts and applies hospital_id', async () => {
    const { fetcher } = renderPage();

    const select = await screen.findByTestId('filter-hospital');
    expect(within(select).getByText(/รพ.ชุมแพ \(83\)/)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'h-chumphae' } });
    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('hospital_id=h-chumphae'))).toBe(true);
    });
  });
});

describe('PregnanciesPage — empty state', () => {
  it('shows the empty message', async () => {
    renderPage({
      ...makeFixture(),
      journeys: [],
      pagination: { total: 0, page: 1, perPage: 20, totalPages: 1 },
    });

    expect((await screen.findAllByText(/ไม่พบข้อมูลฝากครรภ์/)).length).toBeGreaterThan(0);
  });
});

describe('PregnanciesPage — list-page pattern (sub-project 4)', () => {
  it('Thai header and sections; no English mono labels', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'ฝากครรภ์ (ANC)' })).toBeInTheDocument();
    for (const name of ['ระดับความเสี่ยงทั้งจังหวัด', 'กลุ่มที่ต้องติดตาม', 'รายชื่อหญิงตั้งครรภ์']) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    for (const en of ['PROVINCIAL REGISTRY', 'PROVINCE-WIDE', 'OVERDUE EDC', 'MISSED ANC', 'ANC Registry', 'SHOWING', 'HOSPITAL:', 'SORT:', /^PREV$/, /^NEXT$/]) {
      expect(screen.queryByText(en instanceof RegExp ? en : new RegExp(en))).toBeNull();
    }
  });

  it('cohort labels quote config thresholds', async () => {
    renderPage();
    const ltfu = await screen.findByTestId('kpi-ltfu');
    expect(ltfu).toHaveTextContent(`หลุดการติดตาม (${ANC_LAST_VISIT_MAX_AGE_DAYS}–${ANC_OPS.ltfuWindowDays} วัน)`);
    expect(screen.getByTestId('kpi-anc-stale')).toHaveTextContent(`ห่างนัด ANC เกิน ${ANC_OPS.followupWarnDays} วัน`);
  });

  it('list totals and the pager come from pagination.total, not the 3 visible rows', async () => {
    renderPage();
    const list = await screen.findByRole('region', { name: 'รายชื่อหญิงตั้งครรภ์' });
    expect(within(list).getByText('ทั้งหมด 1,169 ราย')).toBeInTheDocument();
    expect(within(list).getByRole('navigation', { name: 'เปลี่ยนหน้า' })).toHaveTextContent('แสดง 1–20 จาก 1,169 ราย');
  });

  it('a row opens the journey; the masked-name link does not double-navigate', async () => {
    nav.push.mockClear();
    renderPage();
    const row = await screen.findByTestId('journey-row-j-ok');
    fireEvent.click(row);
    expect(nav.push).toHaveBeenCalledWith('/pregnancies/j-ok');
    nav.push.mockClear();
    fireEvent.click(within(row).getByRole('link'));
    expect(nav.push).not.toHaveBeenCalled();
    expect(row).toHaveAttribute('aria-label', expect.stringContaining('HN888002'));
    expect(row.getAttribute('aria-label')).not.toContain('ดีงาม');
  });

  it('empty list renders one EmptyState with an actionable Thai description', async () => {
    renderPage({ ...makeFixture(), journeys: [], pagination: { total: 0, page: 1, perPage: 20, totalPages: 1 } });
    // findByText throws on more than one match: the empty state renders once,
    // not inside both the table and the card views.
    expect(await screen.findByText('ไม่พบข้อมูลฝากครรภ์')).toBeInTheDocument();
    expect(screen.getByText(/ยังไม่มีข้อมูลฝากครรภ์ในทะเบียน/)).toBeInTheDocument();
  });
});

describe('PregnanciesPage — stale data', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps the cached rows and shows the stale banner when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetcher } = renderPage();
    expect(await screen.findByTestId('journey-row-j-overdue')).toBeInTheDocument();
    await failNextRefresh(fetcher);
    expect(await screen.findByText(/การเชื่อมต่อล้มเหลว/)).toBeInTheDocument();
    expect(screen.getByTestId('journey-row-j-overdue')).toBeInTheDocument();
  });
});
