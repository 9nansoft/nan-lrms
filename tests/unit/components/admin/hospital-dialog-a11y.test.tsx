// tests/unit/components/admin/hospital-dialog-a11y.test.tsx
// Fix-wave minors for HospitalEditDialog: webhook revoke failures are shown in
// the page (not alert()), controls are named for assistive tech, and the
// poll-interval copy is derived from the poll constants instead of literals.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HospitalEditDialog } from '@/components/admin/HospitalEditDialog';
import { OnlineUsersTab } from '@/components/admin/OnlineUsersTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

vi.mock('@/config/sync-run-status', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/sync-run-status')>()),
  SYNC_LOG_POLL_MS: 30_000,
}));
vi.mock('@/config/presence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/config/presence')>()),
  ONLINE_USERS_POLL_MS: 20_000,
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const DOCTOR = {
  id: 'd1', hospitalId: 'h1', hcode: '10670', cid: '1234567890123', name: 'นพ.สมชาย', position: null,
  phoneNumber: null, isActive: true, createdAt: '', updatedAt: '',
};
const KEY = {
  id: 'k1', hospitalId: 'h1', hcode: '10670', hospitalName: 'รพ.น่าน', keyPrefix: 'kklrms_ab12',
  label: 'Production', isActive: true, lastUsedAt: null, createdAt: '2026-10-01T03:00:00Z', revokedAt: null,
};
const MAP = {
  '/api/admin/hospitals/10670/consult-doctors': { doctors: [DOCTOR] },
  '/api/admin/webhooks': { keys: [KEY] },
  '/api/admin/provinces': { provinces: [] },
  '/api/admin/hospitals/10670/sync-progress?limit=20': {
    runs: [{
      runId: 'r1', hospitalId: 'h1', hcode: '10670', trigger: 'scheduled', startedAt: '2026-10-11T02:59:00Z',
      finishedAt: '2026-10-11T02:59:02Z', durationMs: 2100, outcome: 'success', finalMessage: 'ok', errorMessage: null, steps: [],
    }],
    latest: null,
  },
};
const open = (section: 'consult' | 'webhooks' | 'sync-log') =>
  renderWithSwr(<HospitalEditDialog hospital={adminHospital()} onClose={() => {}} onSaved={() => {}} initialSection={section} />, MAP);

async function startRevoke() {
  await userEvent.click(await screen.findByRole('button', { name: 'ยกเลิกคีย์ kklrms_ab12' }));
  await userEvent.type(screen.getByLabelText('พิมพ์ kklrms_ab12 เพื่อยืนยันการยกเลิก'), 'kklrms_ab12');
  await userEvent.click(screen.getByRole('button', { name: /ยืนยัน$/ }));
}

describe('webhook revoke failure is shown in the page', () => {
  it('a server error renders an alert with the cause and a remedy, never window.alert', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    stubMutations(() => ({ ok: false, status: 500, body: { error: 'ฐานข้อมูลไม่ตอบสนอง' } }));
    open('webhooks');
    await startRevoke();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ฐานข้อมูลไม่ตอบสนอง');
    expect(alert).toHaveTextContent('ลองอีกครั้ง');
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('a network failure is caught and reported with an actionable message', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open('webhooks');
    await startRevoke();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ยกเลิกคีย์ไม่สำเร็จ');
    expect(alert).toHaveTextContent('ตรวจสอบการเชื่อมต่อ');
    expect(alertSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: /ยืนยัน$/ })).toBeEnabled());
  });
});

describe('HospitalEditDialog accessible names', () => {
  it('consult-doctor row buttons name the doctor and are type=button', async () => {
    open('consult');
    const edit = await screen.findByRole('button', { name: 'แก้ไขแพทย์ นพ.สมชาย' });
    const del = screen.getByRole('button', { name: 'ลบแพทย์ นพ.สมชาย' });
    expect(edit).toHaveAttribute('type', 'button');
    expect(del).toHaveAttribute('type', 'button');
  });
});

describe('poll-interval copy comes from the poll constants', () => {
  it('the sync-log header quotes SYNC_LOG_POLL_MS', async () => {
    open('sync-log');
    expect(await screen.findByText(/รีเฟรชอัตโนมัติทุก 30 วินาที/)).toBeInTheDocument();
  });
  it('the online-users retry hint quotes ONLINE_USERS_POLL_MS', async () => {
    renderWithSwr(<OnlineUsersTab />, { '/api/admin/online-users': new Error('redis down') });
    expect(await screen.findByText(/ระบบจะลองใหม่ทุก 20 วินาที/)).toBeInTheDocument();
  });
});
