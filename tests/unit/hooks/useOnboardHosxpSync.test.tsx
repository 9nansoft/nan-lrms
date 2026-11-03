import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOnboardHosxpSync } from '@/hooks/useOnboardHosxpSync';
import { deriveHosxpSyncStatus, MISSING_MARKETPLACE_TOKEN } from '@/lib/hosxp-sync-status';

const h = vi.hoisted(() => ({
  bms: {} as Record<string, unknown>,
  session: { user: { authProvider: 'bms', accessMode: 'readwrite' } } as unknown,
}));

vi.mock('next-auth/react', () => ({ useSession: () => ({ data: h.session }) }));
vi.mock('@/contexts/BmsSessionContext', () => ({ useBmsSession: () => h.bms }));

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ started: true }),
}));
global.fetch = fetchMock as unknown as typeof fetch;

const READY = {
  isReady: true,
  config: { apiUrl: 'https://t.example/api', bearerToken: 'JWT' },
  userInfo: { hospcode: '11004' },
};

beforeEach(() => {
  fetchMock.mockClear();
  h.session = { user: { authProvider: 'bms', accessMode: 'readwrite' } };
});

describe('useOnboardHosxpSync', () => {
  // 2026-10-22 รพ.พล: tabs opened from HOSxP without a marketplace_token sat
  // on "กำลังเริ่ม" forever while sending nothing to the province.
  it('a ready BMS session WITHOUT a marketplace token is reported, not left "starting"', async () => {
    h.bms = { ...READY, marketplaceToken: null };
    const { result } = renderHook(() => useOnboardHosxpSync());
    await waitFor(() => expect(result.current.state).not.toBeNull());
    expect(result.current.state).toEqual({ ran: false, error: MISSING_MARKETPLACE_TOKEN });
    expect(deriveHosxpSyncStatus(result.current.state)).toBe('ERROR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with a marketplace token it starts onboarding as before', async () => {
    h.bms = { ...READY, marketplaceToken: 'MT' };
    const { result } = renderHook(() => useOnboardHosxpSync());
    await waitFor(() => expect(result.current.state?.started).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/onboarding/hosxp-sync',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('a token that arrives later still starts onboarding (the missing-token state is not a latch)', async () => {
    h.bms = { ...READY, marketplaceToken: null };
    const { result, rerender } = renderHook(() => useOnboardHosxpSync());
    await waitFor(() => expect(result.current.state?.error).toBe(MISSING_MARKETPLACE_TOKEN));
    h.bms = { ...READY, marketplaceToken: 'MT' };
    rerender();
    await waitFor(() => expect(result.current.state?.started).toBe(true));
  });

  it('no BMS session yet → nothing reported (still connecting)', async () => {
    h.bms = { isReady: false, config: null, userInfo: null, marketplaceToken: null };
    const { result } = renderHook(() => useOnboardHosxpSync());
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.state).toBeNull();
  });
});
