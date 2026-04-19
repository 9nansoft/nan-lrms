/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 33: StageTab read-only — TDD: write tests FIRST.
// Task 44: extended with form-based CRUD tests (composite write to ipt_labour
// + the legacy `labor` table).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientLabour: vi.fn(),
  getPatientLabor: vi.fn(),
  upsertLabour: vi.fn(),
  upsertLabor: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabour,
  getPatientLabor,
  upsertLabour,
  upsertLabor,
} from '@/services/maternity-ward';
import { StageTab } from '@/components/maternity/tabs/StageTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGetLabour = getPatientLabour as unknown as ReturnType<typeof vi.fn>;
const mockGetLabor = getPatientLabor as unknown as ReturnType<typeof vi.fn>;
const mockUpLabour = upsertLabour as unknown as ReturnType<typeof vi.fn>;
const mockUpLabor = upsertLabor as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const userInfo = { loginname: 'n1', fullname: 'N', hospcode: '10670' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGetLabour.mockReset();
  mockGetLabor.mockReset();
  mockUpLabour.mockReset();
  mockUpLabor.mockReset();
});

describe('StageTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<StageTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading while either fetch is pending', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockReturnValue(new Promise(() => {}));
    mockGetLabor.mockReturnValue(new Promise(() => {}));
    render(<StageTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders fields from both records', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue({
      ipt_labour_id: 99,
      an: 'AN1',
      g: 3,
      ga: 39,
      anc_count: 8,
    });
    mockGetLabor.mockResolvedValue({
      laborid: 7,
      an: 'AN1',
      mother_gvalue: 3,
      mother_hct: 36,
      mother_aging: 28,
    });
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('28')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('36')).toBeInTheDocument();
  });

  it('renders empty state when both records are null', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue(null);
    mockGetLabor.mockResolvedValue(null);
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when a fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabor.mockRejectedValue(new Error('BMS down'));
    mockGetLabour.mockResolvedValue(null);
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('StageTab CRUD', () => {
  const labourRow = { ipt_labour_id: 99, an: 'AN1', g: 3, ga: 39, anc_count: 8 };
  const laborRow = {
    laborid: 7,
    an: 'AN1',
    mother_gvalue: 3,
    mother_hct: 36,
    mother_aging: 28,
  };

  it('clicking แก้ไข reveals form inputs for both records', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGetLabour.mockResolvedValue(labourRow);
    mockGetLabor.mockResolvedValue(laborRow);
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('28')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    expect(screen.getByLabelText('labour_g')).toBeInTheDocument();
    expect(screen.getByLabelText('mother_gvalue')).toBeInTheDocument();
  });

  it('save calls upsertLabour AND upsertLabor with edited fields', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGetLabour.mockResolvedValue(labourRow);
    mockGetLabor.mockResolvedValue(laborRow);
    mockUpLabour.mockResolvedValue(undefined);
    mockUpLabor.mockResolvedValue(undefined);
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('28')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText('labour_g'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('mother_hct'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(mockUpLabor).toHaveBeenCalled());
    expect(mockUpLabour).toHaveBeenCalled();
    expect(mockUpLabour.mock.calls[0][3]).toMatchObject({ g: 4 });
    expect(mockUpLabor.mock.calls[0][3]).toMatchObject({ mother_hct: 40 });
  });

  it('surfaces Thai error when labor write fails after labour succeeded', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGetLabour.mockResolvedValue(labourRow);
    mockGetLabor.mockResolvedValue(laborRow);
    mockUpLabour.mockResolvedValue(undefined);
    mockUpLabor.mockRejectedValue(new Error('rest failed'));
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('28')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(screen.getByText(/ipt_labour สำเร็จ แต่ labor ไม่สำเร็จ/)).toBeInTheDocument(),
    );
  });

  it('cancel exits edit mode without calling upsert', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGetLabour.mockResolvedValue(labourRow);
    mockGetLabor.mockResolvedValue(laborRow);
    render(<StageTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('28')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    expect(screen.getByLabelText('labour_g')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก/ }));
    expect(mockUpLabour).not.toHaveBeenCalled();
    expect(mockUpLabor).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('labour_g')).not.toBeInTheDocument();
  });
});
