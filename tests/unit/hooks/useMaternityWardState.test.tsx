/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

vi.mock('@/hooks/useBmsSession', () => ({
  useBmsSession: vi.fn(),
}));
vi.mock('@/services/maternity-ward', () => ({
  listMaternityWards: vi.fn(),
  listWardBedsInventory: vi.fn(),
  listWardBedsOccupancy: vi.fn(),
}));

import { useBmsSession } from '@/hooks/useBmsSession';
import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancy,
} from '@/services/maternity-ward';
import { useMaternityWardState } from '@/hooks/useMaternityWardState';

const mockBmsSession = useBmsSession as unknown as ReturnType<typeof vi.fn>;
const mockListWards = listMaternityWards as unknown as ReturnType<typeof vi.fn>;
const mockListInventory = listWardBedsInventory as unknown as ReturnType<typeof vi.fn>;
const mockListOccupancy = listWardBedsOccupancy as unknown as ReturnType<typeof vi.fn>;

const cfg = { apiUrl: 'https://t.example/api', bearerToken: 'B', appIdentifier: 'X' };

// Each test gets a fresh SWR cache via a wrapper that mounts SWRConfig with provider:Map.
import { SWRConfig } from 'swr';
const wrapper = ({ children }: { children: ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

beforeEach(() => {
  mockBmsSession.mockReset();
  mockListWards.mockReset();
  mockListInventory.mockReset();
  mockListOccupancy.mockReset();
});

describe('useMaternityWardState', () => {
  it('returns empty + loading=false when no BMS config', () => {
    mockBmsSession.mockReturnValue({ config: null });
    const { result } = renderHook(() => useMaternityWardState(), { wrapper });
    expect(result.current.wards).toEqual([]);
    expect(result.current.ward).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('loads wards + beds + occupancy when config available', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockListWards.mockResolvedValue([{ ward: '03', name: 'ห้องคลอด', real_bedcount: 12 }]);
    mockListInventory.mockResolvedValue([
      {
        bedno: '01',
        roomno: 'LR1',
        bed_order: 1,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR1',
        room_display_number: 1,
      },
    ]);
    mockListOccupancy.mockResolvedValue([]);

    const { result } = renderHook(() => useMaternityWardState(), { wrapper });
    await waitFor(() => expect(result.current.wards).toHaveLength(1), { timeout: 2000 });
    await waitFor(() => expect(result.current.beds).toHaveLength(1), { timeout: 2000 });
    expect(result.current.ward).toBe('03');
    expect(result.current.occupancy).toEqual([]);
    expect(mockListWards).toHaveBeenCalledWith(cfg);
    expect(mockListInventory).toHaveBeenCalledWith(cfg, '03');
    expect(mockListOccupancy).toHaveBeenCalledWith(cfg, '03');
  });

  it('exposes mutateBeds + mutateOccupancy', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockListWards.mockResolvedValue([{ ward: '03', name: 'X', real_bedcount: 1 }]);
    mockListInventory.mockResolvedValue([]);
    mockListOccupancy.mockResolvedValue([]);

    const { result } = renderHook(() => useMaternityWardState(), { wrapper });
    await waitFor(() => expect(result.current.wards).toHaveLength(1), { timeout: 2000 });
    expect(typeof result.current.mutateBeds).toBe('function');
    expect(typeof result.current.mutateOccupancy).toBe('function');
    // Calling mutateOccupancy revalidates
    mockListOccupancy.mockClear();
    await result.current.mutateOccupancy();
    expect(mockListOccupancy).toHaveBeenCalled();
  });

  it('surfaces error when listMaternityWards fails', async () => {
    mockBmsSession.mockReturnValue({ config: cfg });
    mockListWards.mockRejectedValue(new Error('BMS down'));

    const { result } = renderHook(() => useMaternityWardState(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 2000 });
    expect(result.current.error?.message).toBe('BMS down');
  });
});
