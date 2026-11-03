// tests/unit/hooks/useSidebarState.test.ts
import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSidebarState, __resetSidebarStateForTests } from '@/hooks/useSidebarState';

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  __resetSidebarStateForTests();
});

describe('useSidebarState', () => {
  it('defaults to expanded and persists a toggle', () => {
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem('nn-lrms:sidebar-collapsed')).toBe('1');
  });
  it('restores a saved collapsed state', () => {
    window.localStorage.setItem('nn-lrms:sidebar-collapsed', '1');
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(true);
  });
  it('storage that throws (private mode) → expanded, toggle still works', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const { result } = renderHook(() => useSidebarState());
    expect(result.current.collapsed).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.collapsed).toBe(true);
  });
});
