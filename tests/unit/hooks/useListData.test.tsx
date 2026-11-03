import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { useListData } from '@/hooks/useListData';

function wrapper(fetcher: (url: string) => Promise<unknown>) {
  function SwrWrapper({ children }: { children: ReactNode }) {
    return <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>{children}</SWRConfig>;
  }
  return SwrWrapper;
}

describe('useListData', () => {
  it('returns data and stamps lastUpdatedAt on success', async () => {
    const fetcher = vi.fn(async (url: string) => ({ url }));
    const { result } = renderHook(() => useListData<{ url: string }>('/api/x?page=1', 30_000), { wrapper: wrapper(fetcher) });
    expect(result.current.lastUpdatedAt).toBeNull();
    await waitFor(() => expect(result.current.data?.url).toBe('/api/x?page=1'));
    expect(Number.isNaN(Date.parse(result.current.lastUpdatedAt!))).toBe(false);
  });

  it('keeps the previous page on screen while the next key loads', async () => {
    let release: () => void = () => {};
    const fetcher = vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          if (url.endsWith('page=2')) release = () => resolve({ url });
          else resolve({ url });
        }),
    );
    const { result, rerender } = renderHook(({ k }) => useListData<{ url: string }>(k, 30_000), {
      wrapper: wrapper(fetcher),
      initialProps: { k: '/api/x?page=1' },
    });
    await waitFor(() => expect(result.current.data?.url).toBe('/api/x?page=1'));
    rerender({ k: '/api/x?page=2' });
    expect(result.current.data?.url).toBe('/api/x?page=1');
    release();
    await waitFor(() => expect(result.current.data?.url).toBe('/api/x?page=2'));
  });
});
