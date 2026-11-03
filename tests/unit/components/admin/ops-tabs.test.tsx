// tests/unit/components/admin/ops-tabs.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookKeysTab } from '@/components/admin/WebhookKeysTab';
import { MophAlertsTab } from '@/components/admin/MophAlertsTab';
import { SyncOverviewTab } from '@/components/admin/SyncOverviewTab';
import { OnlineUsersTab } from '@/components/admin/OnlineUsersTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const KEY = {
  id: 'k1', hospitalId: 'h1', hcode: '10670', hospitalName: 'รพ.น่าน', keyPrefix: 'kklrms_ab12',
  label: 'Production', isActive: true, lastUsedAt: null, createdAt: '2026-10-01T03:00:00Z', revokedAt: null,
};
const KEYS = {
  '/api/admin/webhooks': { keys: [KEY] },
  '/api/admin/hospitals': { hospitals: [{ hcode: '10670', name: 'รพ.น่าน' }] },
};

describe('WebhookKeysTab — characterization (must not change)', () => {
  it('creates a key with a JSON POST and reveals it once', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      body: { id: 'k2', apiKey: 'kklrms_SECRET', keyPrefix: 'kklrms_cd34', hospitalName: 'รพ.น่าน', hcode: '10670', label: 'ทดสอบ' },
    }));
    renderWithSwr(<WebhookKeysTab />, KEYS);
    await userEvent.selectOptions(await screen.findByLabelText(/โรงพยาบาล/), '10670');
    await userEvent.type(screen.getByPlaceholderText(/Production webhook/), 'ทดสอบ');
    await userEvent.click(screen.getByRole('button', { name: /สร้าง/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hcode: '10670', label: 'ทดสอบ' }),
      }),
    );
    expect(await screen.findByText('kklrms_SECRET')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle('ปิด'));
    expect(screen.queryByText('kklrms_SECRET')).toBeNull();
  });
  it('revoke stays disabled until the key prefix is typed, then DELETEs', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<WebhookKeysTab />, KEYS);
    await userEvent.click(await screen.findByRole('button', { name: /^ยกเลิก/ }));
    const dialog = await screen.findByRole('dialog');
    const confirmBtn = within(dialog).getByRole('button', { name: /ยืนยันยกเลิก/ });
    expect(confirmBtn).toBeDisabled();
    await userEvent.type(within(dialog).getByPlaceholderText('kklrms_ab12'), 'kklrms_ab12');
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks/k1', { method: 'DELETE' }));
  });
});

const MOPH = {
  '/api/admin/config': { config: { active_province_code: '40' } },
  '/api/admin/provinces/40/center-monitors': {
    monitors: [{ id: 'm1', province: '40', cid: '1234567890123', name: 'สมศรี', position: 'พยาบาล', isActive: true, createdAt: '', updatedAt: '' }],
  },
  '/api/admin/moph-alerts?limit=1': { eventQueue: { awaitingRecipients: 0, expired: 0 } },
};

describe('MophAlertsTab — characterization (must not change)', () => {
  it('lists recipients with the CID masked, never in full', async () => {
    renderWithSwr(<MophAlertsTab />, MOPH);
    expect(await screen.findByText('********0123')).toBeInTheDocument();
    expect(screen.queryByText('1234567890123')).toBeNull();
  });
  it('validates the 13-digit CID before any request, then POSTs JSON', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<MophAlertsTab />, MOPH);
    await userEvent.type(await screen.findByPlaceholderText('เลขบัตรประชาชน 13 หลัก'), '123');
    await userEvent.type(screen.getByPlaceholderText('ชื่อผู้รับการแจ้งเตือน'), 'สมชาย');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มผู้รับเตือน/ }));
    expect(await screen.findByText(/CID ต้องเป็นตัวเลข 13 หลัก/)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('เลขบัตรประชาชน 13 หลัก'), '4567890123');
    await userEvent.click(screen.getByRole('button', { name: /เพิ่มผู้รับเตือน/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/provinces/40/center-monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cid: '1234567890123', name: 'สมชาย', position: null, isActive: true }),
      }),
    );
  });
});

const SYNC = {
  '/api/admin/sync-overview': {
    total: 1,
    updatedAt: '2026-10-11T03:00:00Z',
    hospitals: [{
      hcode: '10670', name: 'รพ.น่าน', level: 'A_S', isActive: true, connectionStatus: 'CONNECTED', lastSyncAt: null,
      authenticity: { status: null, reason: null, checkedAt: null, isFailure: false }, dataPurgedAt: null, hasBmsConfig: true,
      latestRun: {
        runId: 'r1', hospitalId: 'h1', hcode: '10670', trigger: 'scheduled', startedAt: '2026-10-11T02:59:00Z',
        finishedAt: '2026-10-11T02:59:02Z', durationMs: 2100, outcome: 'failed', finalMessage: null,
        errorMessage: 'tunnel timeout', steps: [],
      },
    }],
  },
};

describe('SyncOverviewTab — characterization (must not change)', () => {
  it('a hospital row opens the edit dialog on its sync log', async () => {
    // A4: the drill-down now opens the real registry record, so it is served too.
    const { fetcher } = renderWithSwr(<SyncOverviewTab />, { ...SYNC, '/api/admin/hospitals': { hospitals: [adminHospital()] } });
    await userEvent.click(await screen.findByText('tunnel timeout'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/admin/hospitals/10670/sync-progress?limit=20'));
  });
});

describe('OnlineUsersTab — characterization (must not change)', () => {
  it('the headline count is the server total', async () => {
    renderWithSwr(<OnlineUsersTab />, {
      '/api/admin/online-users': { users: [], total: 7, cache: { backend: 'redis', available: true }, updatedAt: '2026-10-11T03:00:00Z' },
    });
    expect(await screen.findByText('7')).toBeInTheDocument();
  });
});

describe('operations tabs — direction-C', () => {
  it('SyncOverviewTab: Thai filter chips, a named clickable table, Thai outcome and trigger', async () => {
    renderWithSwr(<SyncOverviewTab />, SYNC);
    const table = await screen.findByRole('table', { name: 'สถานะการซิงค์รายโรงพยาบาล' });
    expect(within(table).getByRole('row', { name: 'เปิดบันทึกการซิงค์ของ รพ.น่าน' })).toBeInTheDocument();
    expect(within(table).getByText('ล้มเหลว')).toBeInTheDocument();
    expect(within(table).getByText('ตามรอบ')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /มีปัญหา 1/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('รีเฟรชอัตโนมัติทุก 15 วินาที')).toBeInTheDocument();
  });
  it('SyncOverviewTab: a load failure is actionable and retryable', async () => {
    renderWithSwr(<SyncOverviewTab />, { '/api/admin/sync-overview': new Error('redis down') });
    expect(await screen.findByRole('alert')).toHaveTextContent('โหลดสถานะการซิงค์ไม่สำเร็จ');
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
  });
  it('OnlineUsersTab: KPI tile with the server total and an empty state', async () => {
    renderWithSwr(<OnlineUsersTab />, {
      '/api/admin/online-users': { users: [], total: 0, cache: { backend: 'redis', available: true }, updatedAt: '2026-10-11T03:00:00Z' },
    });
    expect(await screen.findByText('ผู้ใช้ออนไลน์ตอนนี้')).toBeInTheDocument();
    expect(screen.getByText('ยังไม่มีผู้ใช้เปิดหน้าเว็บอยู่')).toBeInTheDocument();
    expect(screen.getByText(/หายจากรายการเมื่อไม่มีสัญญาณ 120 วินาที/)).toBeInTheDocument();
  });
  it('WebhookKeysTab: KPI tiles and a Thai table', async () => {
    renderWithSwr(<WebhookKeysTab />, KEYS);
    expect(await screen.findByText('คีย์ทั้งหมด')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'API Key ทั้งหมด' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim())).toEqual([
      'โรงพยาบาล', 'ชื่อคีย์', 'รหัสขึ้นต้น', 'สร้างเมื่อ', 'ใช้ล่าสุด', 'สถานะ', 'จัดการ',
    ]);
  });
  it('MophAlertsTab: recipients in a named table', async () => {
    renderWithSwr(<MophAlertsTab />, MOPH);
    expect(await screen.findByRole('table', { name: 'ผู้รับการแจ้งเตือน' })).toBeInTheDocument();
  });
});
