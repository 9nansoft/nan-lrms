/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 35: StageMedTab read-only — TDD: write tests FIRST.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientStageMedications: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientStageMedications } from '@/services/maternity-ward';
import { StageMedTab } from '@/components/maternity/tabs/StageMedTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientStageMedications as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGet.mockReset();
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
