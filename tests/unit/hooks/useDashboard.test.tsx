// The /hospitals stale banner quotes LIST_PAGE.refreshMs; the data it describes
// comes from useDashboard — they must share one interval.
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { useDashboard } from '@/hooks/useDashboard';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, isValidating: false, mutate: vi.fn() })),
}));
// A sentinel (not the real 30s) proves the hook reads the shared constant
// instead of a hard-coded number that merely happens to match.
vi.mock('@/config/list-page', async (orig) => {
  const actual = await orig<typeof import('@/config/list-page')>();
  return { ...actual, LIST_PAGE: { ...actual.LIST_PAGE, refreshMs: 12_345 } };
});

describe('useDashboard refresh interval', () => {
  it('polls at LIST_PAGE.refreshMs', () => {
    renderHook(() => useDashboard());
    const cfg = vi.mocked(useSWR).mock.calls[0][1] as unknown as { refreshInterval: number };
    expect(cfg.refreshInterval).toBe(12_345);
  });
});
