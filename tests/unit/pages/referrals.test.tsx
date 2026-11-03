// Referrals board page — behavior tests for the redesigned provincial view.
// KPI strips must come from the API's DB-wide counts (never the visible page),
// patient identity must render masked, and INITIATED rows must show SLA aging.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { failNextRefresh } from '../../helpers/swr-stale';
import type {
  ReferralDetailResponse,
  ReferralInsightsResponse,
  ReferralListResponse,
} from '@/types/api';
import { classifyReferralAge, REFERRAL_SLA } from '@/config/referral-sla';
import ReferralsPage from '@/app/(provincial)/referrals/page';

// Mock next/navigation for the app-router page.
const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  usePathname: () => '/referrals',
}));

const HOURS = 3600_000;

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

function makeFixture(): ReferralListResponse {
  return {
    referrals: [
      {
        id: 'ref-emergency',
        journeyId: 'j-1',
        referNumber: 'REF-2569-042',
        fromHospital: 'รพ.พล',
        toHospital: 'รพ.ขอนแก่น',
        status: 'INITIATED',
        reason: 'ตกเลือดหลังคลอด เฝ้าระวังใกล้ชิด',
        diagnosisCode: 'O72.1',
        urgencyLevel: 'EMERGENCY',
        initiatedAt: iso(72 * HOURS),
        arrivedAt: null,
        patientName: 'นาง สายฝน อุ่นเรือน',
        hn: 'HN777001',
        gaWeeks: 38,
        ancRiskLevel: 'HR3',
      },
      {
        id: 'ref-routine',
        journeyId: 'j-2',
        referNumber: 'REF-2569-043',
        fromHospital: 'รพ.บ้านไผ่',
        toHospital: 'รพ.ขอนแก่น',
        status: 'INITIATED',
        reason: 'ฝากครรภ์ต่อเนื่อง',
        diagnosisCode: null,
        urgencyLevel: 'ROUTINE',
        initiatedAt: iso(2 * HOURS),
        arrivedAt: null,
        patientName: 'น.ส. จันทร์เพ็ญ ดีงาม',
        hn: 'HN888002',
        gaWeeks: 32,
        ancRiskLevel: 'LOW',
      },
    ],
    pagination: { total: 125, page: 1, perPage: 20, totalPages: 7 },
    statusCounts: {
      initiated: 125,
      accepted: 0,
      inTransit: 0,
      arrived: 0,
      rejected: 0,
      total: 125,
    },
    opsCounts: { today: 9, last7d: 22, emergencyActive: 13, highRisk: 45, overdue: 7 },
  };
}

function makeInsights(): ReferralInsightsResponse {
  return {
    corridors: [
      {
        fromHospitalId: 'h-phon',
        fromHospital: 'รพ.พล',
        toHospitalId: 'h-kkh',
        toHospital: 'รพ.ขอนแก่น',
        count: 56,
      },
      {
        fromHospitalId: 'h-banphai',
        fromHospital: 'รพ.บ้านไผ่',
        toHospitalId: 'h-kkh',
        toHospital: 'รพ.ขอนแก่น',
        count: 9,
      },
    ],
    daily: Array.from({ length: 7 }, (_, i) => ({
      date: `2026-07-0${i + 2}`,
      count: i + 1,
    })),
    destinations: [
      { id: 'h-kkh', name: 'รพ.ขอนแก่น', count: 56 },
      { id: 'h-sirindhorn', name: 'รพ.สิรินธร จังหวัดขอนแก่น', count: 13 },
    ],
  };
}

function makeDetailResponse(data: ReferralListResponse): ReferralDetailResponse {
  return {
    referral: {
      ...data.referrals[0],
      rejectionReason: null,
      transportMode: null,
      acceptedAt: null,
      departedAt: null,
      rejectedAt: null,
      suggestedAlternativeHospital: null,
    },
  };
}

function renderPage(data: ReferralListResponse = makeFixture()) {
  const fetcher = vi.fn(async (url: string) => {
    if (url.includes('/list?')) return data;
    if (url.includes('/insights')) return makeInsights();
    return makeDetailResponse(data);
  });
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <ReferralsPage />
    </SWRConfig>,
  );
  return { fetcher, ...utils };
}

describe('classifyReferralAge — SLA aging rule', () => {
  it('classifies fresh, overdue, and critical INITIATED referrals', () => {
    const now = new Date('2026-07-08T12:00:00Z');
    const hoursAgo = (h: number) => new Date(now.getTime() - h * HOURS).toISOString();

    expect(classifyReferralAge(hoursAgo(1), 'INITIATED', now)).toBe('fresh');
    expect(
      classifyReferralAge(hoursAgo(REFERRAL_SLA.overdueAfterHours + 1), 'INITIATED', now),
    ).toBe('overdue');
    expect(
      classifyReferralAge(hoursAgo(REFERRAL_SLA.criticalAfterHours + 1), 'INITIATED', now),
    ).toBe('critical');
  });

  it('only INITIATED referrals age — accepted/terminal rows are always fresh', () => {
    const now = new Date('2026-07-08T12:00:00Z');
    const old = new Date(now.getTime() - 100 * HOURS).toISOString();

    expect(classifyReferralAge(old, 'ACCEPTED', now)).toBe('fresh');
    expect(classifyReferralAge(old, 'ARRIVED', now)).toBe('fresh');
    expect(classifyReferralAge(old, 'REJECTED', now)).toBe('fresh');
  });
});

describe('ReferralsPage — KPI strips', () => {
  it('renders ops KPIs from opsCounts, not from the visible rows', async () => {
    renderPage();

    const today = await screen.findByTestId('kpi-today');
    expect(within(today).getByText('9')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-7d')).getByText('22')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-emergency')).getByText('13')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-highrisk')).getByText('45')).toBeInTheDocument();
    expect(within(screen.getByTestId('kpi-overdue')).getByText('7')).toBeInTheDocument();
  });

  it('lays the five ops tiles out 3+2, never a lone tile on its own row', async () => {
    renderPage();
    const grid = (await screen.findByTestId('kpi-today')).closest('.grid') as HTMLElement;
    expect(grid.className).toContain('grid-cols-3');
    expect(grid.className).not.toContain('grid-cols-4');
  });

  it('renders the status breakdown from statusCounts (DB-wide, not page rows)', async () => {
    renderPage();

    const initiated = await screen.findByTestId('status-INITIATED');
    // 125 total INITIATED across the DB while only 2 rows are visible.
    expect(within(initiated).getByText('125')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-ARRIVED')).getByText('0')).toBeInTheDocument();
  });

  it('shows a last-updated stamp', async () => {
    renderPage();
    expect(await screen.findByText(/ข้อมูลหน้านี้ ณ/)).toBeInTheDocument();
  });
});

describe('ReferralsPage — referral rows', () => {
  it('shows refer number, masked patient name, GA, risk level, and diagnosis code', async () => {
    renderPage();

    expect((await screen.findAllByText('REF-2569-042')).length).toBeGreaterThan(0);
    // maskName: last name abbreviated to first char + '.'
    expect(screen.getAllByText(/นาง สายฝน อ\./).length).toBeGreaterThan(0);
    // Full last name must never reach the DOM.
    expect(screen.queryByText(/อุ่นเรือน/)).toBeNull();
    expect(screen.getAllByText(/HN777001/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GA 38/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('HR3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('O72.1').length).toBeGreaterThan(0);
  });

  it('marks EMERGENCY rows and ages INITIATED rows against the SLA', async () => {
    renderPage();

    const row = await screen.findByTestId('referral-row-ref-emergency');
    expect(row.getAttribute('data-urgency')).toBe('EMERGENCY');
    // 72h old INITIATED → critical (>= criticalAfterHours).
    expect(row.getAttribute('data-age')).toBe('critical');
    expect(within(row).getByText(/ค้าง 3 วัน/)).toBeInTheDocument();

    const freshRow = screen.getByTestId('referral-row-ref-routine');
    expect(freshRow.getAttribute('data-age')).toBe('fresh');
  });
});

describe('ReferralsPage — insights panel and destination filter', () => {
  it('renders the busiest corridors and the 7-day volume chart', async () => {
    renderPage();

    const corridors = await screen.findByTestId('corridors-panel');
    expect(within(corridors).getByText(/รพ.พล/)).toBeInTheDocument();
    expect(within(corridors).getByText('56')).toBeInTheDocument();
    expect(screen.getByTestId('daily-volume')).toBeInTheDocument();
  });

  it('lists destination hospitals in the TO filter and applies to_hospital_id', async () => {
    const { fetcher } = renderPage();

    const select = await screen.findByTestId('filter-to-hospital');
    expect(within(select).getByText(/รพ.ขอนแก่น \(56\)/)).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'h-kkh' } });

    await waitFor(() => {
      const urls = fetcher.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('to_hospital_id=h-kkh'))).toBe(true);
    });
  });
});

describe('ReferralsPage — detail dialog', () => {
  it('opens the referral detail dialog when a row is clicked', async () => {
    renderPage();

    fireEvent.click(await screen.findByTestId('referral-row-ref-emergency'));

    expect(await screen.findByText('รายละเอียดการส่งต่อ')).toBeInTheDocument();
    expect(await screen.findByText(/ดูประวัติผู้ป่วย/)).toBeInTheDocument();
  });
});

describe('ReferralsPage — empty state', () => {
  it('shows an empty message when there are no referrals', async () => {
    const empty: ReferralListResponse = {
      ...makeFixture(),
      referrals: [],
      pagination: { total: 0, page: 1, perPage: 20, totalPages: 1 },
    };
    renderPage(empty);

    // Rendered in both the desktop table and the mobile card container.
    expect((await screen.findAllByText(/ไม่พบรายการส่งต่อ/)).length).toBeGreaterThan(0);
  });
});

describe('ReferralsPage — stale data', () => {
  afterEach(() => vi.useRealTimers());
  it('keeps the cached rows and shows the stale banner when a refresh fails', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetcher } = renderPage();
    expect(await screen.findByTestId('referral-row-ref-emergency')).toBeInTheDocument();
    await failNextRefresh(fetcher);
    expect(await screen.findByText(/การเชื่อมต่อล้มเหลว/)).toBeInTheDocument();
    expect(screen.getByTestId('referral-row-ref-emergency')).toBeInTheDocument();
  });
});

const toggleIn =(tile: HTMLElement) => within(tile).getByRole('button', { pressed: false });

describe('ReferralsPage — list-page pattern (sub-project 4)', () => {
  it('Thai header and sections; no English mono labels', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'การส่งต่อ' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'งานส่งต่อ' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'รายการส่งต่อ' })).toBeInTheDocument();
    for (const en of ['PROVINCIAL REGISTRY', 'REFERRAL CORRIDORS', 'VOLUME · LAST 7 DAYS', 'Referral queue', 'URGENCY:', 'PERIOD:', 'STATUS:', 'SHOWING']) {
      expect(screen.queryByText(new RegExp(en))).toBeNull();
    }
  });

  it('the overdue tile quotes REFERRAL_SLA and toggles the overdue filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetcher } = renderPage();
    const overdue = await screen.findByTestId('kpi-overdue');
    expect(overdue).toHaveTextContent(`ค้างเกิน ${REFERRAL_SLA.overdueAfterHours} ชม.`);
    fireEvent.click(toggleIn(overdue));
    await waitFor(() => expect(fetcher.mock.calls.some((c) => String(c[0]).includes('overdue=1'))).toBe(true));
  });

  it('status chips filter by status and carry DB-wide counts', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { fetcher } = renderPage();
    const arrived = await screen.findByTestId('status-ARRIVED');
    // The chip carries the DB-wide ARRIVED count (0 in this fixture), not a page-row tally.
    expect(within(arrived).getByText('0')).toBeInTheDocument();
    expect(within(screen.getByTestId('status-INITIATED')).getByText('125')).toBeInTheDocument();
    fireEvent.click(arrived);
    await waitFor(() => expect(fetcher.mock.calls.some((c) => String(c[0]).includes('status=ARRIVED'))).toBe(true));
  });

  it('queue total and pager read pagination.total, not the 2 visible rows', async () => {
    renderPage();
    const queue = await screen.findByRole('region', { name: 'รายการส่งต่อ' });
    expect(within(queue).getByText(/ทั้งหมด 125 รายการ/)).toBeInTheDocument();
    expect(within(queue).getByRole('navigation', { name: 'เปลี่ยนหน้า' })).toHaveTextContent('แสดง 1–20 จาก 125 รายการ');
  });
});
