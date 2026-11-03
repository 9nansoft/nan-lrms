// tests/unit/components/admin/mutating-surfaces.test.tsx
// Characterization (behaviour pins) for the admin surfaces that WRITE data and
// were restyled in sub-project 5 without request-shape coverage. They pass
// against the code as shipped; they must not change with a redesign.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ActiveProvinceTab } from '@/components/admin/ActiveProvinceTab';
import { BmsConfigTab } from '@/components/admin/BmsConfigTab';
import { BulkAddHospitalsDialog } from '@/components/admin/BulkAddHospitalsDialog';
import { HospitalEditDialog } from '@/components/admin/HospitalEditDialog';
import { SimulationControl } from '@/components/dashboard/SimulationControl';
import { guessHospitalLevel } from '@/config/hospitals';
import { HospitalServiceType } from '@/types/domain';
import { adminHospital, renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const JSON_HEADERS = { 'Content-Type': 'application/json' };

describe('ActiveProvinceTab — characterization (must not change)', () => {
  const MAP = {
    '/api/admin/provinces': { provinces: [{ code: '40', name: 'น่าน' }, { code: '10', name: 'กรุงเทพมหานคร' }] },
    '/api/admin/config': { config: { active_province_code: '40' } },
  };
  it('save is disabled until the selection changes, then PUTs activeProvinceCode', async () => {
    const fetchSpy = stubMutations();
    renderWithSwr(<ActiveProvinceTab />, MAP);
    const select = await screen.findByLabelText('จังหวัดหลัก');
    const save = screen.getByRole('button', { name: 'บันทึก' });
    await waitFor(() => expect(select).toHaveValue('40'));
    expect(save).toBeDisabled();
    expect(screen.getByText(/กำลังใช้งาน: น่าน · 40/)).toBeInTheDocument();
    await userEvent.selectOptions(select, '10');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/config', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ activeProvinceCode: '10' }),
      }),
    );
    expect(await screen.findByText('บันทึกสำเร็จ')).toBeInTheDocument();
  });
  it('shows the server error text when the save is rejected', async () => {
    stubMutations(() => ({ ok: false, status: 403, body: { error: 'forbidden' } }));
    renderWithSwr(<ActiveProvinceTab />, MAP);
    await userEvent.selectOptions(await screen.findByLabelText('จังหวัดหลัก'), '10');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));
    expect(await screen.findByText('forbidden')).toBeInTheDocument();
  });
});

describe('BmsConfigTab — characterization (must not change)', () => {
  const MAP = {
    '/api/admin/hospitals': {
      hospitals: [adminHospital({ bmsConfig: { tunnelUrl: 'https://old.tunnel', hasSession: false, sessionExpiresAt: null, databaseType: null } })],
    },
  };
  async function openEditor() {
    await userEvent.click(await screen.findByRole('button', { name: 'แก้ไข BMS ของ รพ.น่าน' }));
    return screen.findByRole('dialog');
  }
  it('prefills the tunnel URL and PUTs the trimmed value to bms-config', async () => {
    const fetchSpy = stubMutations(() => ({ ok: true, body: { sessionValidated: true, databaseType: 'MySQL' } }));
    renderWithSwr(<BmsConfigTab />, MAP);
    const dialog = await openEditor();
    const input = within(dialog).getByLabelText('Tunnel URL');
    expect(input).toHaveValue('https://old.tunnel');
    await userEvent.clear(input);
    expect(within(dialog).getByRole('button', { name: /บันทึก/ })).toBeDisabled();
    await userEvent.type(input, '  https://new.tunnel  ');
    await userEvent.click(within(dialog).getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/bms-config', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ tunnelUrl: 'https://new.tunnel' }),
      }),
    );
    expect(await within(dialog).findByText(/บันทึกสำเร็จ — Session validated, DB: MySQL/)).toBeInTheDocument();
  });
  it('a rejected save surfaces the server error with a remedy', async () => {
    stubMutations(() => ({ ok: false, status: 400, body: { error: 'bad url' } }));
    renderWithSwr(<BmsConfigTab />, MAP);
    const dialog = await openEditor();
    await userEvent.click(within(dialog).getByRole('button', { name: /บันทึก/ }));
    expect(await within(dialog).findByText('ผิดพลาด: bad url')).toBeInTheDocument();
    expect(within(dialog).getByText(/ตรวจสอบ Tunnel URL/)).toBeInTheDocument();
  });
  it('test-connection POSTs and renders the database result', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      body: { connected: true, databaseType: 'MySQL', databaseVersion: '8.0', tablesFound: ['ipt', 'ovst'] },
    }));
    renderWithSwr(<BmsConfigTab />, MAP);
    const dialog = await openEditor();
    await userEvent.click(within(dialog).getByRole('button', { name: /ทดสอบการเชื่อมต่อ/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/test-connection', { method: 'POST' }),
    );
    expect(await within(dialog).findByText('เชื่อมต่อสำเร็จ')).toBeInTheDocument();
    expect(within(dialog).getByText('Tables: ipt, ovst')).toBeInTheDocument();
  });
});

describe('BulkAddHospitalsDialog — characterization (must not change)', () => {
  const moph = (hcode: string, name: string, typeId: number) => ({
    hcode, name, hospitalTypeId: typeId, bedCount: 30, provinceCode: '40', districtCode: '4001',
  });
  const MAP = {
    '/api/admin/moph-hospitals?province=40': {
      hospitals: [moph('11001', 'รพ.เอ', 5), moph('11002', 'รพ.บี', 7), moph('11003', 'รพ.ซี', 8), moph('10670', 'รพ.ลงทะเบียนแล้ว', 6)],
    },
    '/api/admin/hospitals': { hospitals: [{ hcode: '10670' }] },
  };
  const renderOpen = () => {
    const onClose = vi.fn();
    const onAdded = vi.fn();
    renderWithSwr(<BulkAddHospitalsDialog open onClose={onClose} provinceCode="40" provinceName="น่าน" onAdded={onAdded} />, MAP);
    return { onClose, onAdded };
  };
  it('lists only unregistered hospitals and pre-selects the A_S/M1/F2 tiers', async () => {
    renderOpen();
    expect(await screen.findByText('รพ.เอ')).toBeInTheDocument();
    expect(screen.queryByText('รพ.ลงทะเบียนแล้ว')).toBeNull();
    expect(await screen.findByText('เลือกแล้ว 2 / 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'เพิ่ม 2 แห่ง' })).toBeEnabled();
  });
  it('POSTs one JSON body per picked hospital with the guessed level and service type, then closes', async () => {
    const fetchSpy = stubMutations();
    const { onClose, onAdded } = renderOpen();
    await userEvent.click(await screen.findByRole('button', { name: 'เพิ่ม 2 แห่ง' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onAdded).toHaveBeenCalledTimes(1);
    const bodies = fetchSpy.mock.calls.map(([url, init]) => {
      expect(url).toBe('/api/admin/hospitals');
      expect(init).toMatchObject({ method: 'POST', headers: JSON_HEADERS });
      return JSON.parse(String(init!.body));
    });
    expect(bodies).toHaveLength(2);
    expect(bodies).toContainEqual({
      hcode: '11001', name: 'รพ.เอ', level: guessHospitalLevel(5), serviceType: HospitalServiceType.PROVINCIAL_HUB,
      provinceCode: '40', districtCode: '4001', isActive: true,
    });
    expect(bodies).toContainEqual({
      hcode: '11002', name: 'รพ.บี', level: guessHospitalLevel(7), serviceType: HospitalServiceType.DISTRICT_WITH_MATERNITY,
      provinceCode: '40', districtCode: '4001', isActive: true,
    });
  });
  it('a partial failure stays open, reports the failed hcode, and still refreshes the caller', async () => {
    stubMutations((_url, init) =>
      JSON.parse(String(init!.body)).hcode === '11002' ? { ok: false, status: 409, body: { error: 'duplicate' } } : { ok: true },
    );
    const { onClose, onAdded } = renderOpen();
    await userEvent.click(await screen.findByRole('button', { name: 'เพิ่ม 2 แห่ง' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('เพิ่มไม่สำเร็จ 1 รายการ');
    expect(alert).toHaveTextContent('11002 — duplicate');
    expect(onClose).not.toHaveBeenCalled();
    expect(onAdded).toHaveBeenCalledTimes(1);
  });
  it('with nothing selected the add button is disabled and nothing is sent', async () => {
    const fetchSpy = stubMutations();
    renderOpen();
    await userEvent.click(await screen.findByRole('button', { name: 'เลือกทั้งหมด' })); // 2/3 → 3/3
    await userEvent.click(screen.getByRole('button', { name: 'ยกเลิกเลือกทั้งหมด' })); // 3/3 → 0
    expect(screen.getByRole('button', { name: 'เพิ่ม 0 แห่ง' })).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('SimulationControl — characterization (must not change)', () => {
  const open = async () => {
    renderWithSwr(<SimulationControl />, {});
    await userEvent.click(screen.getByRole('button', { name: /SIMULATE/ }));
    return screen.findByRole('dialog');
  };
  const lastButton = (dialog: HTMLElement, name: string) => {
    const all = within(dialog).getAllByRole('button', { name });
    return all[all.length - 1];
  };
  const posted = (spy: ReturnType<typeof stubMutations>, suffix: string) =>
    spy.mock.calls.some(([u]) => String(u).endsWith(suffix));

  it('clear patient data is two-step: the first click only asks, Cancel backs out without a request', async () => {
    const fetchSpy = stubMutations();
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear patient data' }));
    expect(within(dialog).getByText(/ยืนยันการลบข้อมูลผู้ป่วย/)).toBeInTheDocument();
    expect(posted(fetchSpy, '/clear')).toBe(false);
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Cancel' })[0]);
    expect(within(dialog).queryByText(/ยืนยันการลบข้อมูลผู้ป่วย/)).toBeNull();
    expect(posted(fetchSpy, '/clear')).toBe(false);
  });
  it('confirming clear POSTs /api/dev/simulate/clear and reports the counts', async () => {
    const fetchSpy = stubMutations((url) =>
      url.endsWith('/clear') ? { ok: true, body: { ok: true, cleared: { cached_patients: 3 } } } : { ok: true, body: {} },
    );
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear patient data' }));
    await userEvent.click(lastButton(dialog, 'Clear patient data'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/dev/simulate/clear', { method: 'POST' }));
    expect(await within(dialog).findByText('cached_patients=3')).toBeInTheDocument();
  });
  it('reset onboarding is two-step and POSTs /reset-onboarding only after confirm', async () => {
    const fetchSpy = stubMutations((url) =>
      url.endsWith('/reset-onboarding') ? { ok: true, body: { ok: true, cleared: { hospitals: 2 } } } : { ok: true, body: {} },
    );
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset onboarding' }));
    expect(posted(fetchSpy, '/reset-onboarding')).toBe(false);
    await userEvent.click(lastButton(dialog, 'Reset onboarding'));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/dev/simulate/reset-onboarding', { method: 'POST' }));
    expect(await within(dialog).findByText('hospitals=2')).toBeInTheDocument();
  });
  it('a failed reset shows the server error text', async () => {
    stubMutations((url) =>
      url.endsWith('/reset-onboarding') ? { ok: false, status: 500, body: { ok: false, error: 'db locked' } } : { ok: true, body: {} },
    );
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Reset onboarding' }));
    await userEvent.click(lastButton(dialog, 'Reset onboarding'));
    expect(await within(dialog).findByText('db locked')).toBeInTheDocument();
  });
  it('start POSTs the preset config to /api/dev/simulate/start', async () => {
    const fetchSpy = stubMutations((url) =>
      url.endsWith('/start')
        ? { ok: true, body: { running: true, startedAt: null, stoppingAt: null, config: null, hospitals: [], recentEvents: [] } }
        : { ok: true, body: {} },
    );
    const dialog = await open();
    await userEvent.click(within(dialog).getByRole('button', { name: /^Start simulation$/ }));
    await waitFor(() => expect(fetchSpy.mock.calls.some(([u]) => u === '/api/dev/simulate/start')).toBe(true));
    const call = fetchSpy.mock.calls.find(([u]) => u === '/api/dev/simulate/start')!;
    expect(call[1]).toMatchObject({ method: 'POST', headers: JSON_HEADERS });
    const body = JSON.parse(String(call[1]!.body));
    expect(body.hospitals).toEqual([]); // every hospital selected → empty list means "all"
    expect(body.eventTypes.length).toBeGreaterThan(0);
    expect(typeof body.ratePerHospitalPerMin).toBe('number');
    expect(typeof body.durationMin).toBe('number');
  });
});

describe('HospitalEditDialog consult doctors & webhooks — characterization (must not change)', () => {
  const DOCTOR = {
    id: 'd1', hospitalId: 'h1', hcode: '10670', cid: '1234567890123', name: 'นพ.สมชาย', position: 'สูติแพทย์',
    phoneNumber: '081-111-1111', isActive: true, createdAt: '', updatedAt: '',
  };
  const KEY = {
    id: 'k1', hospitalId: 'h1', hcode: '10670', hospitalName: 'รพ.น่าน', keyPrefix: 'kklrms_ab12',
    label: 'Production', isActive: true, lastUsedAt: null, createdAt: '2026-10-01T03:00:00Z', revokedAt: null,
  };
  const MAP = {
    '/api/admin/hospitals/10670/consult-doctors': { doctors: [DOCTOR] },
    '/api/admin/webhooks': { keys: [KEY] },
    '/api/admin/provinces': { provinces: [{ code: '40', name: 'น่าน' }] },
  };
  const openSection = (section: 'consult' | 'webhooks') =>
    renderWithSwr(<HospitalEditDialog hospital={adminHospital()} onClose={() => {}} onSaved={() => {}} initialSection={section} />, MAP);

  it('add doctor validates the 13-digit CID locally, then POSTs JSON with nulls for empty optionals', async () => {
    const fetchSpy = stubMutations();
    openSection('consult');
    await userEvent.type(await screen.findByPlaceholderText('1234567890123'), '123');
    await userEvent.type(screen.getByPlaceholderText('ชื่อ-สกุล'), 'นพ.ใหม่');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มแพทย์' }));
    expect(await screen.findByText('CID ต้องเป็นตัวเลข 13 หลัก')).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    await userEvent.type(screen.getByPlaceholderText('1234567890123'), '4567890123');
    await userEvent.click(screen.getByRole('button', { name: 'เพิ่มแพทย์' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/consult-doctors', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ cid: '1234567890123', name: 'นพ.ใหม่', position: null, phoneNumber: null }),
      }),
    );
    expect(await screen.findByText('เพิ่มแพทย์ consult สำเร็จ')).toBeInTheDocument();
  });
  it('edit loads the row into the form and PUTs to the doctor URL', async () => {
    const fetchSpy = stubMutations();
    openSection('consult');
    await userEvent.click(await screen.findByRole('button', { name: /แก้/ }));
    expect(screen.getByPlaceholderText('ชื่อ-สกุล')).toHaveValue('นพ.สมชาย');
    await userEvent.clear(screen.getByPlaceholderText('ชื่อ-สกุล'));
    await userEvent.type(screen.getByPlaceholderText('ชื่อ-สกุล'), 'นพ.สมหญิง');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/consult-doctors/d1', {
        method: 'PUT',
        headers: JSON_HEADERS,
        body: JSON.stringify({ cid: '1234567890123', name: 'นพ.สมหญิง', position: 'สูติแพทย์', phoneNumber: '081-111-1111' }),
      }),
    );
  });
  it('delete asks window.confirm first; cancelling sends nothing, accepting DELETEs', async () => {
    const fetchSpy = stubMutations();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openSection('consult');
    const del = await screen.findByRole('button', { name: 'ลบแพทย์ นพ.สมชาย' });
    await userEvent.click(del);
    expect(confirmSpy).toHaveBeenCalledWith('ลบแพทย์ consult นพ.สมชาย?');
    expect(fetchSpy).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    await userEvent.click(del);
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/hospitals/10670/consult-doctors/d1', { method: 'DELETE' }),
    );
    expect(await screen.findByText('ลบแพทย์ consult สำเร็จ')).toBeInTheDocument();
  });
  it('webhook create POSTs hcode + trimmed label and reveals the key once', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      body: { apiKey: 'kklrms_SECRET', keyPrefix: 'kklrms_cd34', label: 'ทดสอบ' },
    }));
    openSection('webhooks');
    await userEvent.type(await screen.findByPlaceholderText(/Production webhook/), ' ทดสอบ ');
    await userEvent.click(screen.getByRole('button', { name: /สร้าง Key/ }));
    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ hcode: '10670', label: 'ทดสอบ' }),
      }),
    );
    expect(await screen.findByText('kklrms_SECRET')).toBeInTheDocument();
  });
  it('webhook revoke stays disabled until the exact prefix is typed, then DELETEs', async () => {
    const fetchSpy = stubMutations();
    openSection('webhooks');
    await userEvent.click(await screen.findByRole('button', { name: /^ยกเลิก/ }));
    const confirmBtn = screen.getByRole('button', { name: /ยืนยัน$/ });
    expect(confirmBtn).toBeDisabled();
    const input = screen.getByPlaceholderText('kklrms_ab12');
    await userEvent.type(input, 'kklrms_ab1');
    expect(confirmBtn).toBeDisabled();
    await userEvent.type(input, '2');
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledWith('/api/admin/webhooks/k1', { method: 'DELETE' }));
  });
});
