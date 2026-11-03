// tests/unit/components/admin/hospital-edit-dialog.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HospitalEditDialog } from '@/components/admin/HospitalEditDialog';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const MAP = {
  '/api/admin/hospitals/10670/consult-doctors': { doctors: [] },
  '/api/admin/webhooks': { keys: [] },
  '/api/admin/provinces': { provinces: [{ code: '40', name: 'น่าน' }] },
  '/api/admin/hospitals/10670/data': { counts: {}, totalRows: 42 },
};
const open = (initialSection?: 'sync-log') =>
  renderWithSwr(<HospitalEditDialog hospital={adminHospital()} onClose={() => {}} onSaved={() => {}} initialSection={initialSection} />, MAP);

describe('HospitalEditDialog — characterization (must not change)', () => {
  it('General save PUTs JSON to the hospital URL', async () => {
    const fetchSpy = stubMutations();
    open();
    await userEvent.click(await screen.findByRole('button', { name: /^บันทึก$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/hospitals/10670');
    expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init!.body))).toMatchObject({ name: 'รพ.น่าน', isActive: true });
  });
  it('purge stays disabled until the hcode is typed exactly, then DELETEs with confirmHcode', async () => {
    const fetchSpy = stubMutations(() => ({ ok: true, body: { ok: true, counts: {} } }));
    open();
    await userEvent.click(await screen.findByRole('button', { name: /Danger Zone|ลบข้อมูล/ }));
    const purge = await screen.findByRole('button', { name: /ลบข้อมูลของโรงพยาบาลนี้/ });
    expect(purge).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('10670'), '1067');
    expect(purge).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('10670'), '0');
    expect(purge).toBeEnabled();
    await userEvent.click(purge);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmHcode: '10670' }),
      }),
    );
  });
  it('opening on sync-log fetches the run trail', async () => {
    const { fetcher } = open('sync-log');
    await waitFor(() => expect(fetcher).toHaveBeenCalledWith('/api/admin/hospitals/10670/sync-progress?limit=20'));
  });
});

describe('HospitalEditDialog — Thai labels on the tokens', () => {
  it('section tabs and header facts are Thai', async () => {
    open();
    for (const label of ['ข้อมูลทั่วไป', 'แพทย์ที่ปรึกษา', 'การเชื่อมต่อ BMS', 'บันทึกการซิงค์', 'คีย์ Webhook', 'ลบข้อมูล']) {
      expect(await screen.findByRole('button', { name: new RegExp(label) })).toBeInTheDocument();
    }
    expect(screen.getByText('ข้อมูลการทำงานของโรงพยาบาล')).toBeInTheDocument();
    expect(screen.getByText('ใช้งาน')).toBeInTheDocument();
    expect(screen.queryByText(/Hospital Operations Profile|Danger Zone|LAST SYNC/)).toBeNull();
  });
});
