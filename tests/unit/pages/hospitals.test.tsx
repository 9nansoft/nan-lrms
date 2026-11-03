// Hospitals network board — behavior tests for the redesigned directory.
// Sync freshness must be visible per hospital (constitution V), ANC must be a
// first-class axis alongside labor, and rows must order by real workload.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { DashboardHospital } from '@/types/api';
import HospitalsPage from '@/app/(provincial)/hospitals/page';
import { HOSPITAL_LEVELS } from '@/config/hospitals';
import { HospitalLevel } from '@/types/domain';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  usePathname: () => '/hospitals',
}));

// Leaflet cannot render in jsdom — stub the map, keep the props contract.
vi.mock('@/components/dashboard/ProvinceMap', () => ({
  ProvinceMap: ({ hospitals }: { hospitals: DashboardHospital[] }) => (
    <div data-testid="map-stub" data-pin-count={hospitals.length} />
  ),
}));

const MIN = 60_000;

function iso(msAgo: number): string {
  return new Date(Date.now() - msAgo).toISOString();
}

// Real NAN hcodes so the จ.น่าน tab filter keeps them visible.
function makeHospitals(): DashboardHospital[] {
  return [
    {
      hcode: '10716',
      name: 'โรงพยาบาลน่าน',
      level: 'A_S' as DashboardHospital['level'],
      connectionStatus: 'ONLINE' as DashboardHospital['connectionStatus'],
      lastSyncAt: iso(13 * 24 * 60 * MIN), // 13 days stale → critical
      counts: { low: 0, medium: 0, high: 0, total: 0 },
      ancCounts: { total: 62, hr3: 5 },
      partographQuality: { laborRecent: 10, withPartograph: 2 }, // 20% → critical
      syncStatus: 'OK' as DashboardHospital['syncStatus'],
      syncBlockedReason: null,
    },
    {
      hcode: '11173',
      name: 'โรงพยาบาลแม่จริม',
      level: 'M2' as DashboardHospital['level'],
      connectionStatus: 'ONLINE' as DashboardHospital['connectionStatus'],
      lastSyncAt: iso(2 * MIN), // fresh
      counts: { low: 1, medium: 0, high: 0, total: 1 },
      ancCounts: { total: 215, hr3: 20 },
      partographQuality: { laborRecent: 4, withPartograph: 3 }, // 75% → ok
      syncStatus: 'OK' as DashboardHospital['syncStatus'],
      syncBlockedReason: null,
    },
    {
      hcode: '11174',
      name: 'โรงพยาบาลบ้านหลวง',
      level: 'M2' as DashboardHospital['level'],
      connectionStatus: 'OFFLINE' as DashboardHospital['connectionStatus'],
      lastSyncAt: null,
      counts: { low: 0, medium: 0, high: 0, total: 0 },
      ancCounts: { total: 10, hr3: 0 },
      partographQuality: { laborRecent: 0, withPartograph: 0 }, // no admissions → none
      syncStatus: 'BLOCKED' as DashboardHospital['syncStatus'],
      syncBlockedReason: 'missing_marketplace_token',
    },
  ];
}

function renderPage(hospitals: DashboardHospital[] = makeHospitals()) {
  const payload = { hospitals, updatedAt: new Date().toISOString() };
  const fetcher = vi.fn(async (_url: string) => payload);
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>
      <HospitalsPage />
    </SWRConfig>,
  );
  return { fetcher, ...utils };
}

describe('HospitalsPage — KPI strip', () => {
  it('shows the ANC registry as a first-class KPI (total + HR3)', async () => {
    renderPage();

    const anc = await screen.findByTestId('kpi-anc');
    expect(within(anc).getByText('287')).toBeInTheDocument(); // 62 + 215 + 10
    expect(within(anc).getByText(/HR3 25/)).toBeInTheDocument(); // 5 + 20
  });

  it('breaks sync health down instead of a binary online count', async () => {
    renderPage();

    const sync = await screen.findByTestId('kpi-sync');
    // Only one hospital has fresh data.
    expect(within(sync).getByText('1')).toBeInTheDocument();
    expect(within(sync).getByText(/ระงับการซิงค์ 1/)).toBeInTheDocument();
    expect(within(sync).getByText(/ล่าช้า 1/)).toBeInTheDocument();
  });

  it('shows a last-updated stamp in the header', async () => {
    renderPage();
    expect(await screen.findByText(/ข้อมูลหน้านี้ ณ/)).toBeInTheDocument();
  });
});

describe('HospitalsPage — roster rows', () => {
  it('classifies each row by sync freshness and shows relative sync age', async () => {
    renderPage();

    const hub = await screen.findByTestId('hospital-row-10716');
    expect(hub.getAttribute('data-sync')).toBe('critical');
    expect(within(hub).getByText(/13 วัน/)).toBeInTheDocument();

    expect(screen.getByTestId('hospital-row-11173').getAttribute('data-sync')).toBe('ok');

    const blocked = screen.getByTestId('hospital-row-11174');
    expect(blocked.getAttribute('data-sync')).toBe('blocked');
    expect(within(blocked).getByText(/ระงับการซิงค์/)).toBeInTheDocument();
  });

  it('shows ANC and labor counts per row', async () => {
    renderPage();

    const row = await screen.findByTestId('hospital-row-11173');
    expect(within(row).getByText('215')).toBeInTheDocument(); // ANC
    expect(within(row).getByText('1')).toBeInTheDocument(); // labor
  });

  it('orders rows within a level group by combined workload, busiest first', async () => {
    renderPage();

    await screen.findByTestId('hospital-row-11173');
    const rows = screen.getAllByTestId(/hospital-row-/);
    const codes = rows.map((r) => r.getAttribute('data-testid'));
    // Both M2 hospitals: แม่จริม (workload ~22.5) before บ้านหลวง (~1).
    expect(codes.indexOf('hospital-row-11173')).toBeLessThan(codes.indexOf('hospital-row-11174'));
  });

  it('shows the partograph data-quality KPI and per-row coverage', async () => {
    renderPage();

    // Province KPI: 5 of 14 recent admissions charted → 36%, one hospital
    // below the quality threshold.
    const kpi = await screen.findByTestId('kpi-partograph');
    expect(kpi.textContent).toContain('36%');
    expect(kpi.textContent).toMatch(/ต่ำกว่าเกณฑ์\s*1/);

    // Per-row coverage cell, colored by the config thresholds.
    const critical = within(screen.getByTestId('hospital-row-10716')).getByTestId('parto-cell');
    expect(critical.getAttribute('data-parto')).toBe('critical');
    expect(critical.textContent).toContain('2/10');

    const none = within(screen.getByTestId('hospital-row-11174')).getByTestId('parto-cell');
    expect(none.getAttribute('data-parto')).toBe('none');
  });
});


describe('HospitalsPage — list-page pattern (sub-project 4)', () => {
  it('is a Thai page: one h1, page-data freshness, no English mono labels', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { level: 1, name: 'โรงพยาบาลในเครือข่าย' })).toBeInTheDocument();
    for (const en of ['PROVINCIAL REGISTRY', 'ROSTER', 'DATA SYNC', 'ANC REGISTRY', 'LABOR WARD', 'PARTOGRAPH QUALITY', 'Hospital roster', 'Network map', 'NODES']) {
      expect(screen.queryByText(new RegExp(en))).toBeNull();
    }
  });

  it('map and roster are section cards; the roster is grouped by level in Thai', async () => {
    renderPage();
    expect(await screen.findByRole('region', { name: 'แผนที่เครือข่ายโรงพยาบาล' })).toBeInTheDocument();
    const roster = screen.getByRole('region', { name: 'รายชื่อโรงพยาบาล' });
    expect(within(roster).getByRole('heading', { level: 3, name: new RegExp(HOSPITAL_LEVELS[HospitalLevel.M2].nameTh) })).toBeInTheDocument();
    expect(within(roster).getByText(/แสดง 3 จาก 3 แห่ง/)).toBeInTheDocument();
  });

  it('the KPI tiles sit in a Thai summary SectionCard like the other list pages', async () => {
    renderPage();
    const summary = await screen.findByRole('region', { name: 'ภาพรวมเครือข่าย' });
    expect(within(summary).getByTestId('kpi-roster')).toBeInTheDocument();
  });

  it('a row opens the hospital console; its name link does not double-navigate', async () => {
    nav.push.mockClear();
    renderPage();
    const row = await screen.findByTestId('hospital-row-11173');
    fireEvent.click(row);
    expect(nav.push).toHaveBeenCalledWith('/hospitals/11173');
    nav.push.mockClear();
    fireEvent.click(within(row).getByRole('link', { name: 'โรงพยาบาลแม่จริม' }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('search filters the roster only and shows an empty state when nothing matches', async () => {
    renderPage();
    const box = await screen.findByRole('searchbox', { name: /ค้นหา/ });
    fireEvent.change(box, { target: { value: 'ไม่มีชื่อนี้' } });
    expect(await screen.findByText('ไม่พบโรงพยาบาลที่ตรงกับคำค้น')).toBeInTheDocument();
    expect(screen.getByTestId('map-stub').getAttribute('data-pin-count')).toBe('3');
  });

  it('the area toggle is a pressed-state chip pair with counts', async () => {
    renderPage();
    const area = await screen.findByRole('group', { name: 'พื้นที่' });
    const nan = within(area).getByRole('button', { name: /จ\.น่าน/ });
    expect(nan).toHaveAttribute('aria-pressed', 'true');
    expect(within(nan).getByText('3')).toBeInTheDocument();
  });
});
