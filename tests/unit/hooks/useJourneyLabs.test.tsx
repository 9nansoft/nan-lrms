/* @vitest-environment jsdom */
import { describe, it, expect } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { useJourneyLabs } from '@/hooks/useJourneyLabs';

function wrapperFor(fetcher: (key: string) => Promise<unknown>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0, fetcher }}>
        {children}
      </SWRConfig>
    );
  };
}

describe('useJourneyLabs', () => {
  it('reads the journey labs route and returns its results', async () => {
    const keys: string[] = [];
    const lab = { id: 'r1' };
    const { result } = renderHook(() => useJourneyLabs('j-1'), {
      wrapper: wrapperFor((key) => {
        keys.push(key);
        return Promise.resolve({ results: [lab], tier: 'own_results' });
      }),
    });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.results).toEqual([lab]));
    expect(keys[0]).toBe('/api/journeys/j-1/labs');
    expect(result.current.tier).toBe('own_results');
    expect(result.current.isForbidden).toBe(false);
  });

  it('marks a 403 so the panel can explain it instead of offering a retry', async () => {
    const denied = Object.assign(new Error('ไม่มีสิทธิ์'), { status: 403 });
    const { result } = renderHook(() => useJourneyLabs('j-1'), {
      wrapper: wrapperFor(() => Promise.reject(denied)),
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isForbidden).toBe(true);
    expect(result.current.results).toBeNull();
  });

  it('does not treat other failures as a permission problem', async () => {
    const { result } = renderHook(() => useJourneyLabs('j-1'), {
      wrapper: wrapperFor(() => Promise.reject(Object.assign(new Error('x'), { status: 500 }))),
    });
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.isForbidden).toBe(false);
  });
});
