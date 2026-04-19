/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 37: InfantTab read-only — TDD: write tests FIRST.
// Task 48: extended with table+inline-edit CRUD tests (composite write to
// ipt_newborn + ipt_labour_infant).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientInfants: vi.fn(),
  upsertNewborn: vi.fn(),
  upsertLabourInfant: vi.fn(),
  deleteInfant: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientInfants,
  upsertNewborn,
  upsertLabourInfant,
  deleteInfant,
} from '@/services/maternity-ward';
import { InfantTab } from '@/components/maternity/tabs/InfantTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientInfants as unknown as ReturnType<typeof vi.fn>;
const mockUpNew = upsertNewborn as unknown as ReturnType<typeof vi.fn>;
const mockUpLI = upsertLabourInfant as unknown as ReturnType<typeof vi.fn>;
const mockDelete = deleteInfant as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const userInfo = { loginname: 'n1', fullname: 'N', hospcode: '10670' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGet.mockReset();
  mockUpNew.mockReset();
  mockUpLI.mockReset();
  mockDelete.mockReset();
});

describe('InfantTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<InfantTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<InfantTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([
      {
        ipt_newborn_id: 11,
        ipt_labour_infant_id: 22,
        an: 'AN1',
        sex: 'M',
        birth_weight: 3200,
        infant_hn: 'HN-INF1',
      },
    ]);
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('M')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('3200')).toBeInTheDocument();
  });

  it('renders empty state when data is []', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([]);
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});

describe('InfantTab CRUD', () => {
  const sampleRow = {
    ipt_newborn_id: 11,
    ipt_labour_infant_id: 22,
    an: 'AN1',
    sex: 'M',
    birth_weight: 3200,
    infant_hn: 'HN-INF1',
  };

  it('clicking + เพิ่มทารก shows an inline edit row', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([]);
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มทารก/ }));
    expect(screen.getByLabelText('sex')).toBeInTheDocument();
  });

  it('save calls BOTH upsertNewborn AND upsertLabourInfant', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockUpNew.mockResolvedValue({});
    mockUpLI.mockResolvedValue({});
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('M')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.change(screen.getByLabelText('birth_weight'), { target: { value: '3300' } });
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() => expect(mockUpLI).toHaveBeenCalled());
    expect(mockUpNew).toHaveBeenCalled();
    expect(mockUpNew.mock.calls[0][3]).toMatchObject({
      ipt_newborn_id: 11,
      birth_weight: 3300,
    });
    expect(mockUpLI.mock.calls[0][3]).toMatchObject({
      ipt_labour_infant_id: 22,
      birth_weight: 3300,
    });
  });

  it('surfaces Thai error when ipt_labour_infant fails after newborn succeeded', async () => {
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockUpNew.mockResolvedValue({});
    mockUpLI.mockRejectedValue(new Error('rest failed'));
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('M')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /แก้ไข/ }));
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await waitFor(() =>
      expect(
        screen.getByText(/ipt_newborn สำเร็จ แต่ ipt_labour_infant ไม่สำเร็จ/),
      ).toBeInTheDocument(),
    );
  });

  it('delete calls deleteInfant with both PKs after confirm', async () => {
    const origConfirm = window.confirm;
    window.confirm = vi.fn().mockReturnValue(true);
    mockBmsSession.mockReturnValue({ config: cfg, userInfo });
    mockGet.mockResolvedValue([sampleRow]);
    mockDelete.mockResolvedValue(undefined);
    render(<InfantTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText('M')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /ลบ/ }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(mockDelete).toHaveBeenCalled());
    expect(mockDelete.mock.calls[0][2]).toBe(11); // ipt_newborn_id
    expect(mockDelete.mock.calls[0][3]).toBe(22); // ipt_labour_infant_id
    window.confirm = origConfirm;
  });
});
