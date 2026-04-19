/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 30: PartographTab read-only — TDD: write tests FIRST.
// Task 41: extended with CRUD (Add / Edit / Save / Delete / Cancel) tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientPartograph: vi.fn(),
  upsertPartograph: vi.fn(),
  deletePartograph: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientPartograph,
  upsertPartograph,
  deletePartograph,
} from '@/services/maternity-ward';
import { PartographTab } from '@/components/maternity/tabs/PartographTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientPartograph as unknown as ReturnType<typeof vi.fn>;
const mockUpsert = upsertPartograph as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deletePartograph as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const userInfo = { loginname: 'n1', fullname: 'N', hospcode: '10670' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGet.mockReset();
  mockUpsert.mockReset();
  mockDelete.mockReset();
});

describe('PartographTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<PartographTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading', () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PartographTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([
      {
        ipt_labour_partograph_id: 1,
        ipt_labour_id: 10,
        an: 'AN1',
        observe_datetime: '2026-04-19T08:00:00',
        hour_no: 1,
        fetal_heart_rate: 140,
        cervical_dilation_cm: 4,
        contraction_per_10min: 3,
        bp_systolic: 120,
        bp_diastolic: 70,
        amniotic_fluid: null,
        moulding: null,
        descent_of_head: null,
        contraction_duration_sec: null,
        contraction_strength: null,
        oxytocin_uml: null,
        oxytocin_drops_min: null,
        drugs_iv_fluids: null,
        pulse: null,
        temperature: null,
        urine_volume_ml: null,
        urine_protein: null,
        urine_glucose: null,
        urine_acetone: null,
        note: null,
      },
    ]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('140')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('renders empty state when data is []', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('PartographTab CRUD', () => {
  const sampleRow = {
    ipt_labour_partograph_id: 1,
    ipt_labour_id: 10,
    an: 'AN1',
    observe_datetime: '2026-04-19T08:00:00',
    hour_no: 1,
    fetal_heart_rate: 140,
    cervical_dilation_cm: 4,
    contraction_per_10min: 3,
    bp_systolic: 120,
    bp_diastolic: 70,
    amniotic_fluid: null,
    moulding: null,
    descent_of_head: null,
    contraction_duration_sec: null,
    contraction_strength: null,
    oxytocin_uml: null,
    oxytocin_drops_min: null,
    drugs_iv_fluids: null,
    pulse: null,
    temperature: null,
    urine_volume_ml: null,
    urine_protein: null,
    urine_glucose: null,
    urine_acetone: null,
    note: null,
  };

  it('clicking + เพิ่มเวลาใหม่ shows an inline edit row at top', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มเวลาใหม่/ }));
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('save calls upsertPartograph and mutates SWR', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockUpsert.mockResolvedValue({});
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('140')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    const cervix = screen.getByDisplayValue('4');
    fireEvent.change(cervix, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const callArg = mockUpsert.mock.calls[0][3]; // 4th arg: row
    expect(callArg).toMatchObject({ ipt_labour_partograph_id: 1, cervical_dilation_cm: 5 });
  });

  it('delete calls deletePartograph after confirm', async () => {
    const origConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockDelete.mockResolvedValue(undefined);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('140')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    window.confirm = origConfirm;
  });

  it('cancel exits edit mode without calling upsert', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('140')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    expect(screen.getByDisplayValue('4')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('4')).not.toBeInTheDocument();
  });

  it('delete is not called when confirm returns false', async () => {
    const origConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(false);
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('140')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    window.confirm = origConfirm;
  });
});
