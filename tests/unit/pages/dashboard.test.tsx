// tests/unit/pages/dashboard.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DashboardPage from '@/app/(provincial)/page';
import type { ProvinceDashboard } from '@/hooks/useProvinceDashboard';
import {
  makeContinuum,
  makeHighRiskPatient,
  makeHospital,
  makeStageKPIs,
  makeSummary,
  makeTrends,
} from '../../helpers/dashboard-fixtures';

const h = vi.hoisted(() => ({
  dash: {} as Record<string, unknown>,
  kiosk: { isKiosk: false, toggleKiosk: () => {}, exitKiosk: () => {} },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }));
vi.mock('@/hooks/useProvinceDashboard', () => ({ useProvinceDashboard: () => h.dash }));
vi.mock('@/hooks/useKioskMode', () => ({ useKioskMode: () => h.kiosk }));
vi.mock('@/components/dashboard/ProvinceMap', () => ({ ProvinceMap: () => <div data-testid="province-map" /> }));
vi.mock('@/components/dashboard/province/ProvinceOverviewDialog', () => ({
  ProvinceOverviewDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div role="dialog" aria-label="overview-dialog">
        <div data-testid="province-map" />
      </div>
    ) : null,
}));
vi.mock('@/components/dashboard/OnlineUsersBadge', () => ({
  OnlineUsersBadge: () => <span data-testid="online-users-badge" />,
}));
vi.mock('@/components/dashboard/HospitalDetailDialog', () => ({ HospitalDetailDialog: () => null }));

function baseDash(over: Partial<ProvinceDashboard> = {}): ProvinceDashboard {
  return {
    hospitals: [makeHospital(), makeHospital({ hcode: '10671', name: 'รพ.ชุมแพ' })],
    summary: makeSummary(),
    stageKPIs: makeStageKPIs(),
    alerts: { referralAlerts: 7, overdueAnc: 138, dueSoon: 172 },
    trends: makeTrends(),
    continuum: makeContinuum(),
    updatedAt: new Date().toISOString(),
    isLoading: false,
    error: undefined,
    highRiskPatients: [makeHighRiskPatient()],
    hrLoading: false,
    sseState: 'connected',
    hosxpSyncState: null,
    // What useHosxpBrowserSync derives for a null sync state.
    hosxpStatus: 'STARTING',
    hosxpDetail: 'CONNECTING',
    hosxpHelp: 'ระบบกำลังเริ่มการเชื่อมต่อ HOSxP',
    onboardingError: null,
    syncing: false,
    refreshAll: vi.fn(),
    triggerSync: vi.fn(async () => {}),
    dataStale: false,
    onlineCount: 2,
    reportingCount: 2,
    freshCount: 1,
    ancFallback: { hr3: 106, dueSoon: 172 },
    ...over,
  };
}

beforeEach(() => {
  h.dash = baseDash();
  h.kiosk = { isKiosk: false, toggleKiosk: () => {}, exitKiosk: () => {} };
});

describe('Provincial dashboard page', () => {
  it('composes the Thai sections under one page heading', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'ภาพรวมจังหวัดน่าน' })).toBeInTheDocument();
    for (const name of [
      'งานที่ต้องจัดการ',
      'ห้องคลอดทั้งจังหวัด',
      'ฝากครรภ์และการส่งต่อ',
      'ผู้คลอดเสี่ยงสูงและในห้องคลอด',
      'ระยะการดูแล',
      'สรุปเวร',
      'ภาพรวมโรงพยาบาล',
    ]) {
      expect(screen.getByRole('region', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
  });

  it('renders no OnlineUsersBadge of its own (AppHeader already does)', () => {
    render(<DashboardPage />);
    expect(screen.queryAllByTestId('online-users-badge')).toHaveLength(0);
  });

  it('has no English war-room labels in normal mode', () => {
    render(<DashboardPage />);
    expect(
      screen.queryByText(/ALL CLEAR|ACTIVE ALERTS|REFERRAL ACTION|ACTIVE LABOR|ADMISSIONS · LAST 24H|SHIFT SUMMARY|PPHO WAR-ROOM|NODES|Province overview/),
    ).toBeNull();
  });

  it('KPI counts come from server aggregates, not row lengths', () => {
    h.dash = baseDash({ summary: makeSummary({ totalActive: 1234 }), highRiskPatients: [makeHighRiskPatient()] });
    render(<DashboardPage />);
    expect(within(screen.getByTestId('vital-active')).getByText('1,234')).toBeInTheDocument();
  });

  it('kiosk mode renders the frozen kiosk instead', () => {
    h.kiosk = { ...h.kiosk, isKiosk: true };
    render(<DashboardPage />);
    expect(screen.getByText('PPHO WAR-ROOM')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('loading, error-without-cache and stale-cache states', () => {
    h.dash = baseDash({ isLoading: true });
    const { unmount } = render(<DashboardPage />);
    expect(screen.getByText('กำลังโหลดภาพรวมจังหวัด...')).toBeInTheDocument();
    unmount();

    h.dash = baseDash({ error: new Error('boom'), updatedAt: null });
    const second = render(<DashboardPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่สามารถโหลดข้อมูลภาพรวมจังหวัดได้');
    expect(screen.getByRole('alert')).toHaveTextContent('วิธีแก้:');
    second.unmount();

    h.dash = baseDash({ error: new Error('x'), dataStale: true });
    render(<DashboardPage />);
    expect(screen.getByText('การเชื่อมต่อล้มเหลว — แสดงข้อมูลเดิมจากแคช')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('webhook onboarding error is actionable and dismissible', () => {
    h.dash = baseDash({ onboardingError: 'HTTP 500' });
    render(<DashboardPage />);
    expect(screen.getByText('ไม่สามารถอัปเดต webhook_setting บน HOSxP')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(screen.queryByText('ไม่สามารถอัปเดต webhook_setting บน HOSxP')).toBeNull();
  });

  it('keeps exactly one Leaflet map mounted while the overview dialog is open', () => {
    render(<DashboardPage />);
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'ขยายแผนที่เต็มจอ' }));
    expect(screen.getByRole('dialog', { name: 'overview-dialog' })).toBeInTheDocument();
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
    expect(within(screen.getByRole('dialog', { name: 'overview-dialog' })).getByTestId('province-map')).toBeInTheDocument();
  });

  it('provides the @container ancestor and no ancestor clips sticky', () => {
    render(<DashboardPage />);
    const panel = screen.getByTestId('province-overview');
    let el: HTMLElement | null = panel.parentElement;
    let hasContainer = false;
    while (el && el !== document.body) {
      expect(el.className).not.toMatch(/overflow-(hidden|auto|scroll|x-|y-)/);
      if (/(^|\s)@container(\s|$)/.test(el.className)) hasContainer = true;
      el = el.parentElement;
    }
    expect(hasContainer).toBe(true);
  });

  it('wires CareStageSection instead of the legacy stage cards', () => {
    render(<DashboardPage />);
    expect(screen.getByRole('region', { name: 'ระยะการดูแล' })).toBeInTheDocument();
    expect(screen.queryByText(/CARE CONTINUUM/)).toBeNull();
  });
});
