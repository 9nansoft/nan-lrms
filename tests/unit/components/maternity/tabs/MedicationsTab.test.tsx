/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 34: MedicationsTab read-only — TDD: write tests FIRST.
// Task 45: extended with table+inline-edit CRUD tests.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientLabourMedications: vi.fn(),
  upsertLabourMedication: vi.fn(),
  deleteLabourMedication: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabourMedications,
  upsertLabourMedication,
  deleteLabourMedication,
} from '@/services/maternity-ward';
import { MedicationsTab } from '@/components/maternity/tabs/MedicationsTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientLabourMedications as unknown as ReturnType<typeof vi.fn>;
const mockUpsert = upsertLabourMedication as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deleteLabourMedication as unknown as ReturnType<typeof vi.fn>;
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

describe('MedicationsTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<MedicationsTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<MedicationsTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([
      {
        labour_medication_id: 1,
        an: 'AN1',
        icode: 'D0001',
        qty: 2,
        doctor_code: 'D1',
        drugusage: '1x3 oral',
        medication_note_text: 'after meal',
      },
    ]);
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('D0001')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('1x3 oral')).toBeInTheDocument();
    expect(screen.getByText('after meal')).toBeInTheDocument();
  });

  it('renders empty state when data is []', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([]);
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('MedicationsTab CRUD', () => {
  const sampleRow = {
    labour_medication_id: 1,
    an: 'AN1',
    icode: 'D0001',
    qty: 2,
    doctor_code: 'D1',
    drugusage: '1x3 oral',
    medication_note_text: 'after meal',
  };

  it('clicking + เพิ่มรายการยา shows an inline edit row', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([]);
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการยา/ }));
    expect(screen.getByLabelText('icode')).toBeInTheDocument();
  });

  it('save calls upsertLabourMedication with edited fields', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockUpsert.mockResolvedValue({});
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('D0001')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText('qty'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(mockUpsert).toHaveBeenCalled());
    const callArg = mockUpsert.mock.calls[0][3];
    expect(callArg).toMatchObject({ labour_medication_id: 1, qty: 3 });
  });

  it('delete calls deleteLabourMedication after confirm', async () => {
    const origConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockDelete.mockResolvedValue(undefined);
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('D0001')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    window.confirm = origConfirm;
  });

  it('cancel exits edit mode without calling upsert', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    render(<MedicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('D0001')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    expect(screen.getByLabelText('icode')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('icode')).not.toBeInTheDocument();
  });
});
