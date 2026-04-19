/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 36: ComplicationsTab read-only — TDD: write tests FIRST.
// Two-step fetch: first resolves ipt_labour_id via getPatientLabour, then
// fetches complications via getPatientComplications keyed by that id.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({
  getPatientLabour: vi.fn(),
  getPatientComplications: vi.fn(),
}));
import { useBmsSession } from '@/hooks/useBmsSession';
import {
  getPatientLabour,
  getPatientComplications,
} from '@/services/maternity-ward';
import { ComplicationsTab } from '@/components/maternity/tabs/ComplicationsTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGetLabour = getPatientLabour as unknown as ReturnType<typeof vi.fn>;
const mockGetComps = getPatientComplications as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGetLabour.mockReset();
  mockGetComps.mockReset();
});

describe('ComplicationsTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<ComplicationsTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading while labour lookup is pending', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockReturnValue(new Promise(() => {}));
    render(<ComplicationsTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue({
      ipt_labour_id: 99,
      an: 'AN1',
      g: 2,
      ga: 38,
      anc_count: 4,
    });
    mockGetComps.mockResolvedValue([
      {
        ipt_labour_complication_id: 1,
        ipt_labour_id: 99,
        labour_complication_id: 5,
        labour_stage_id: 2,
        complication_note: 'PPH treated',
        complication_name: 'Postpartum hemorrhage',
      },
    ]);
    render(<ComplicationsTab an="AN1" />, { wrapper });
    await waitFor(
      () => expect(screen.getByText('Postpartum hemorrhage')).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(screen.getByText('PPH treated')).toBeInTheDocument();
  });

  it('renders empty state when complications are []', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue({
      ipt_labour_id: 99,
      an: 'AN1',
      g: 2,
      ga: 38,
      anc_count: 4,
    });
    mockGetComps.mockResolvedValue([]);
    render(<ComplicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue({
      ipt_labour_id: 99,
      an: 'AN1',
      g: 2,
      ga: 38,
      anc_count: 4,
    });
    mockGetComps.mockRejectedValue(new Error('BMS down'));
    render(<ComplicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('shows empty when labour record missing (no ipt_labour_id, no complications fetched)', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGetLabour.mockResolvedValue(null);
    render(<ComplicationsTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
    expect(mockGetComps).not.toHaveBeenCalled();
  });
});
