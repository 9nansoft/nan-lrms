import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { LIST_PAGE } from '@/config/list-page';

describe('useDebouncedSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('commits the trimmed term after the debounce and calls onCommit once', () => {
    const onCommit = vi.fn();
    const { result } = renderHook(() => useDebouncedSearch(onCommit));
    act(() => result.current.setSearch('  HN00 '));
    act(() => vi.advanceTimersByTime(LIST_PAGE.searchDebounceMs - 1));
    expect(result.current.query).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.query).toBe('HN00');
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('does not commit on mount or when the term is unchanged', () => {
    const onCommit = vi.fn();
    renderHook(() => useDebouncedSearch(onCommit));
    act(() => vi.advanceTimersByTime(LIST_PAGE.searchDebounceMs * 2));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('clear() empties both the field and the query immediately', () => {
    const { result } = renderHook(() => useDebouncedSearch(() => {}));
    act(() => result.current.setSearch('abc'));
    act(() => vi.advanceTimersByTime(LIST_PAGE.searchDebounceMs));
    act(() => result.current.clear());
    expect(result.current.search).toBe('');
    expect(result.current.query).toBe('');
  });
});
