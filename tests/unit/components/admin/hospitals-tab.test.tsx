// tests/unit/components/admin/hospitals-tab.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HospitalsTab } from '@/components/admin/HospitalsTab';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

const failing = adminHospital({
  hcode: '10671', name: 'รพ.ชุมแพ',
  bmsConfig: { tunnelUrl: 'https://t', hasSession: false, sessionExpiresAt: null, databaseType: null,
    authenticity: { status: 'cid_unstable', checkedAt: null, reason: null } },
});
const BASE = {
  '/api/admin/hospitals': { hospitals: [adminHospital(), failing] },
  '/api/admin/config': { config: { active_province_code: '40' } },
  '/api/admin/provinces': { provinces: [{ code: '40', name: 'น่าน' }] },
  '/api/admin/hospitals/data-counts': { counts: { '10670': { totalRows: 1234, perTable: { cached_patients: 1234 } } } },
  '/api/admin/moph-hospitals?province=40': {
    hospitals: [{ hcode: '10999', name: 'รพ.ใหม่', hospitalTypeId: 7, bedCount: 30, provinceCode: '40', districtCode: '4002' }],
  },
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('HospitalsTab — characterization (must not change)', () => {
  it('adds a hospital from the MOPH registry with a JSON POST', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click(await screen.findByRole('button', { name: /เพิ่มโรงพยาบาล/ }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getAllByRole('combobox')[0], '10999');
    await userEvent.click(within(dialog).getByRole('button', { name: /^เพิ่ม$/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/admin/hospitals');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/json' } });
    expect(JSON.parse(String(init!.body))).toMatchObject({ hcode: '10999', name: 'รพ.ใหม่', provinceCode: '40', districtCode: '4002', isActive: true });
  });
  it('deletes only after confirm(), with DELETE to the hospital URL', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    const del = (await screen.findAllByRole('button', { name: /^ลบ/ }))[0];
    await userEvent.click(del);
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.click(del);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670', { method: 'DELETE' }));
    expect(confirmSpy).toHaveBeenNthCalledWith(1, 'ลบ รพ.น่าน (10670)?\nข้อมูลการตั้งค่า BMS จะถูกลบไปด้วย');
  });
  it('clear-purge needs confirm() and POSTs to clear-purge', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fetchSpy = stubMutations();
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click(await screen.findByRole('button', { name: /เปิดใช้งาน.*อีกครั้ง/ }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10671/clear-purge', { method: 'POST' }));
  });
});

describe('HospitalsTab — direction-C', () => {
  it('is a real table with Thai headers (B1)', async () => {
    renderWithSwr(<HospitalsTab />, BASE);
    const table = await screen.findByRole('table', { name: 'โรงพยาบาลในระบบ' });
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.trim());
    expect(headers).toEqual(['โรงพยาบาล', 'ประเภทบริการ', 'จังหวัด', 'สถานะ', 'ข้อมูลในระบบ', 'จัดการ']);
  });
  it('the card says how many hospitals and how many are active', async () => {
    renderWithSwr(<HospitalsTab />, { ...BASE, '/api/admin/hospitals': { hospitals: [adminHospital(), adminHospital({ hcode: '10672', name: 'รพ.พล', isActive: false })] } });
    expect(await screen.findByText('2 แห่ง · ใช้งาน 1 · ปิดใช้งาน 1')).toBeInTheDocument();
  });
  it('a failed delete is reported in the page with a remedy, not with alert() (B5)', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    stubMutations(() => ({ ok: false, status: 409, body: { error: 'hospital has data' } }));
    renderWithSwr(<HospitalsTab />, BASE);
    await userEvent.click((await screen.findAllByRole('button', { name: /^ลบ/ }))[0]);
    const banner = await screen.findByRole('alert');
    expect(banner).toHaveTextContent('ลบ รพ.น่าน (10670) ไม่สำเร็จ: hospital has data');
    expect(banner).toHaveTextContent('วิธีแก้:');
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('a load failure is actionable and retryable', async () => {
    renderWithSwr(<HospitalsTab />, { ...BASE, '/api/admin/hospitals': new Error('column x does not exist') });
    expect(await screen.findByText('โหลดรายการโรงพยาบาลไม่สำเร็จ')).toBeInTheDocument();
    expect(screen.getByText('column x does not exist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeInTheDocument();
  });
});

describe('HospitalsTab — narrow-column chips', () => {
  it('status badge and service-type label never wrap onto two lines', async () => {
    renderWithSwr(<HospitalsTab />, {
      ...BASE,
      '/api/admin/hospitals': { hospitals: [adminHospital({ serviceType: 'DISTRICT_WITH_MATERNITY', provinceCode: '40' })] },
    });
    const table = await screen.findByRole('table', { name: 'โรงพยาบาลในระบบ' });
    expect(within(table).getByText('ใช้งาน').className).toMatch(/whitespace-nowrap/);
    expect(within(table).getByText('รพช. มีห้องคลอด').className).toMatch(/whitespace-nowrap/);
  });
  it('province column resolves name + code from provinceCode (blank only when the row has none)', async () => {
    renderWithSwr(<HospitalsTab />, {
      ...BASE,
      '/api/admin/hospitals': { hospitals: [adminHospital({ provinceCode: '40' })] },
    });
    expect(await screen.findByText('น่าน · 40')).toBeInTheDocument();
  });
});
