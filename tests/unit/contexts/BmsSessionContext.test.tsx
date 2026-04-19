/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
/// <reference lib="dom" />

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { BmsSessionProvider, useBmsSession } from '@/contexts/BmsSessionContext';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

const wrapper = ({ children }: { children: ReactNode }) => (
  <BmsSessionProvider>{children}</BmsSessionProvider>
);

beforeEach(() => {
  mockFetch.mockReset();
  document.cookie = 'bms-session-id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = 'marketplace_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  localStorage.clear();
  window.history.replaceState({}, '', 'http://localhost/');
});

describe('BmsSessionProvider', () => {
  it('starts with isReady false when no URL session and no cookie', () => {
    const { result } = renderHook(() => useBmsSession(), { wrapper });
    expect(result.current.isReady).toBe(false);
    expect(result.current.config).toBeNull();
  });

  it('hydrates from URL session and becomes isReady', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jwt: 'JWT',
        bms_url: 'https://t.example/api',
        user_info: { loginname: 'n1', fullname: 'Nurse', hospcode: '10670' },
      }),
    });
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=URL-SID');

    const { result } = renderHook(() => useBmsSession(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true), { timeout: 2000 });
    expect(result.current.config?.apiUrl).toBe('https://t.example/api');
    expect(result.current.config?.bearerToken).toBe('JWT');
    expect(result.current.userInfo?.loginname).toBe('n1');
    expect(window.location.search).not.toContain('bms-session-id');
  });

  it('sets error on retrieve failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      text: async () => 'expired',
    });
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=BAD');

    const { result } = renderHook(() => useBmsSession(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeTruthy(), { timeout: 2000 });
    expect(result.current.isReady).toBe(false);
  });

  it('clear() wipes state and cookie', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jwt: 'X',
        bms_url: 'https://t.example/api',
        user_info: { loginname: 'n1', fullname: 'N', hospcode: '10670' },
      }),
    });
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=Y');
    const { result } = renderHook(() => useBmsSession(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true), { timeout: 2000 });

    act(() => result.current.clear());
    expect(result.current.isReady).toBe(false);
    expect(document.cookie).not.toContain('bms-session-id=Y');
  });

  it('marketplace token pairing: new URL session without paired marketplace_token drops stale token', async () => {
    localStorage.setItem('marketplace_token', 'STALE');
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jwt: 'X',
        bms_url: 'https://t.example/api',
        user_info: { loginname: 'n1', fullname: 'N', hospcode: '10670' },
      }),
    });
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=NEW');
    renderHook(() => useBmsSession(), { wrapper });
    await waitFor(() => expect(localStorage.getItem('marketplace_token')).toBeNull(), {
      timeout: 2000,
    });
  });

  it('throws when useBmsSession called outside provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useBmsSession())).toThrow(/BmsSessionProvider/);
    spy.mockRestore();
  });
});
