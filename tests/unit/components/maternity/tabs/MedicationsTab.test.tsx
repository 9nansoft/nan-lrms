/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 34: MedicationsTab read-only — TDD: write tests FIRST.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientLabourMedications: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientLabourMedications } from '@/services/maternity-ward';
import { MedicationsTab } from '@/components/maternity/tabs/MedicationsTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientLabourMedications as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGet.mockReset();
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
