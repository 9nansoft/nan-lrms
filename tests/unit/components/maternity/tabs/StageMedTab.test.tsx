/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 35: StageMedTab read-only — TDD: write tests FIRST.
// Task 46: extended with table+inline-edit CRUD tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientStageMedications: vi.fn(),
  upsertStageMedication: vi.fn(),
  deleteStageMedication: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientStageMedications,
  upsertStageMedication,
  deleteStageMedication,
} from '@/services/maternity-ward';
import { StageMedTab } from '@/components/maternity/tabs/StageMedTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientStageMedications as unknown as ReturnType<typeof vi.fn>;
const mockUpsert = upsertStageMedication as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deleteStageMedication as unknown as ReturnType<typeof vi.fn>;
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

describe('StageMedTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<StageMedTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<StageMedTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([
      {
        labour_stage_medication_id: 1,
        an: 'AN1',
        icode: 'D0001',
        med_number: 1,
        medication_result_text: null,
        qty: 2,
        medication_date: '2026-04-19',
        medication_time: '10:30:00',
        staff: 'user1',
        medication_note: 'IV bolus',
        medication_name: 'Oxytocin 10 units',
        staff_name: 'พยาบาล A',
      },
    ]);
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Oxytocin 10 units')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('พยาบาล A')).toBeInTheDocument();
    expect(screen.getByText('IV bolus')).toBeInTheDocument();
  });

  it('renders empty state when data is []', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([]);
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('StageMedTab CRUD', () => {
  const sampleRow = {
    labour_stage_medication_id: 1,
    an: 'AN1',
    icode: 'D0001',
    med_number: 1,
    medication_result_text: null,
    qty: 2,
    medication_date: '2026-04-19',
    medication_time: '10:30:00',
    staff: 'user1',
    medication_note: 'IV bolus',
    medication_name: 'Oxytocin 10 units',
    staff_name: 'พยาบาล A',
  };

  it('clicking + เพิ่มรายการยา shows an inline edit row', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([]);
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการยา/ }));
    expect(screen.getByLabelText('icode')).toBeInTheDocument();
  });

  it('save calls upsertStageMedication with edited fields', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockUpsert.mockResolvedValue({});
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Oxytocin 10 units')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText('qty'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const callArg = mockUpsert.mock.calls[0][3];
    expect(callArg).toMatchObject({ labour_stage_medication_id: 1, qty: 4 });
  });

  it('delete calls deleteStageMedication after confirm', async () => {
    const origConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockDelete.mockResolvedValue(undefined);
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Oxytocin 10 units')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    window.confirm = origConfirm;
  });

  it('cancel exits edit mode without calling upsert', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    render(<StageMedTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('Oxytocin 10 units')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    expect(screen.getByLabelText('icode')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('icode')).not.toBeInTheDocument();
  });
});
