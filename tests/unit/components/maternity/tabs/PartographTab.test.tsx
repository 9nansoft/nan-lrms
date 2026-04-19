/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 30: PartographTab read-only — TDD: write tests FIRST.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({ useBmsSession: vi.fn() }));
vi.mock('@/services/maternity-ward', () => ({ getPatientPartograph: vi.fn() }));
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientPartograph } from '@/services/maternity-ward';
import { PartographTab } from '@/components/maternity/tabs/PartographTab';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockGet = getPatientPartograph as unknown as ReturnType<typeof vi.fn>;
const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockGet.mockReset();
});

describe('PartographTab', () => {
  it('shows no-config message when BMS session absent', () => {
    mockBmsSession.mockReturnValue({ config: null });
    render(<PartographTab an="AN1" />, { wrapper });
    expect(screen.getByText(/ไม่พร้อมใช้งาน/)).toBeInTheDocument();
  });

  it('shows loading', () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<PartographTab an="AN1" />, { wrapper });
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  it('renders table rows from data', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
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
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockResolvedValue([]);
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/ไม่พบข้อมูล/)).toBeInTheDocument(), { timeout: 2000 });
  });

  it('renders error state when fetch fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockGet.mockRejectedValue(new Error('BMS down'));
    render(<PartographTab an="AN1" />, { wrapper });
    await waitFor(() => expect(screen.getByText(/โหลดไม่สำเร็จ.*BMS down/)).toBeInTheDocument(), { timeout: 2000 });
  });
});
