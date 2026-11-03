// tests/unit/components/admin/admin-page.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/layout/BreadcrumbContext', () => ({ useSetBreadcrumbs: vi.fn() }));
vi.mock('@/components/admin/AdminMapPane', () => ({
  AdminMapPane: ({ onSelectHospital }: { onSelectHospital?: (h: string) => void }) => (
    <button type="button" onClick={() => onSelectHospital?.('10670')}>pin-10670</button>
  ),
}));
vi.mock('@/components/admin/HospitalsTab', () => ({
  HospitalsTab: ({ autoEditHcode }: { autoEditHcode?: string | null }) => (
    <div data-testid="hospitals-tab" data-auto-edit={autoEditHcode ?? ''} />
  ),
}));
vi.mock('@/components/admin/ActiveProvinceTab', () => ({ ActiveProvinceTab: () => <div data-testid="province-tab" /> }));
vi.mock('@/components/admin/BmsConfigTab', () => ({ BmsConfigTab: () => <div data-testid="bms-tab" /> }));
vi.mock('@/components/admin/WebhookKeysTab', () => ({ WebhookKeysTab: () => <div data-testid="keys-tab" /> }));
vi.mock('@/components/admin/SyncOverviewTab', () => ({ SyncOverviewTab: () => <div data-testid="sync-tab" /> }));
vi.mock('@/components/admin/OnlineUsersTab', () => ({ OnlineUsersTab: () => <div data-testid="users-tab" /> }));
vi.mock('@/components/admin/SimulationTab', () => ({ SimulationTab: () => <div data-testid="sim-tab" /> }));
vi.mock('@/components/admin/MophAlertsTab', () => ({ MophAlertsTab: () => <div data-testid="moph-tab" /> }));

import AdminPage from '@/app/(provincial)/admin/page';

describe('AdminPage — characterization (must not change)', () => {
  it('opens on จังหวัดหลัก; a map pin jumps to the hospitals tab with auto-edit', async () => {
    render(<AdminPage />);
    expect(screen.getByTestId('province-tab')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'pin-10670' }));
    expect(await screen.findByTestId('hospitals-tab')).toHaveAttribute('data-auto-edit', '10670');
  });
});

describe('AdminPage — direction-C layout', () => {
  const TAB_LABELS = ['จังหวัดหลัก', 'โรงพยาบาล', 'การเชื่อมต่อ BMS', 'คีย์ Webhook', 'สถานะการซิงค์', 'ผู้ใช้ออนไลน์', 'จำลองข้อมูล', 'แจ้งเตือน MOPH (LINE)'];
  it('is a titled page with a Thai tablist', () => {
    render(<AdminPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'ตั้งค่าระบบ' })).toBeInTheDocument();
    const list = screen.getByRole('tablist', { name: 'หมวดการตั้งค่า' });
    expect(within(list).getAllByRole('tab').map((t) => t.textContent?.trim())).toEqual(TAB_LABELS);
  });
  it('selecting a tab shows only its panel', async () => {
    render(<AdminPage />);
    await userEvent.click(screen.getByRole('tab', { name: 'สถานะการซิงค์' }));
    expect(screen.getByTestId('sync-tab')).toBeInTheDocument();
    expect(screen.queryByTestId('province-tab')).toBeNull();
  });
  it('labels the map region and drops zoom / fixed-width columns', () => {
    const { container } = render(<AdminPage />);
    expect(screen.getByRole('region', { name: 'แผนที่โรงพยาบาล' })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/zoom|minmax\(520px/);
  });
});
