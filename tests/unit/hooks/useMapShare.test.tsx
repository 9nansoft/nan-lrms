/* @vitest-environment jsdom */
// Unit tests for the persisted map/list split hook (Province overview).
// The hook loads the stored share via useSyncExternalStore so the page
// needs no mount effect (react-hooks/set-state-in-effect flagged the old
// setMapShare-in-effect) and SSR hydration never reads localStorage.
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapShare, MAP_SHARE_DEFAULT } from '@/hooks/useMapShare';

const KEY = 'dashboard.overview-map-share-pct';
const stored = () => window.localStorage.getItem(KEY);

describe('useMapShare', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts at the 40% default when nothing is persisted', () => {
    const { result } = renderHook(() => useMapShare());
    expect(result.current.mapShare).toBe(MAP_SHARE_DEFAULT);
    expect(stored()).toBeNull();
  });

  it('picks up the persisted share on first render — no mount effect', () => {
    window.localStorage.setItem(KEY, '65');
    const { result } = renderHook(() => useMapShare());
    expect(result.current.mapShare).toBe(65);
  });

  it.each([
    ['150', 85], // above max → clamped down
    ['0', 15], // below min → clamped up
    ['abc', 40], // garbage → default
  ])('sanitizes a bogus persisted value %s → %s', (raw, expected) => {
    window.localStorage.setItem(KEY, raw);
    const { result } = renderHook(() => useMapShare());
    expect(result.current.mapShare).toBe(expected);
  });

  it('previewMapShare moves the split without touching storage (mid-drag)', () => {
    const { result } = renderHook(() => useMapShare());
    act(() => result.current.previewMapShare(60));
    expect(result.current.mapShare).toBe(60);
    expect(stored()).toBeNull();
  });

  it('saveMapShare persists the previewed value, rounded; display stays exact', () => {
    const { result } = renderHook(() => useMapShare());
    act(() => result.current.previewMapShare(62.4));
    act(() => result.current.saveMapShare());
    expect(stored()).toBe('62');
    expect(result.current.mapShare).toBe(62.4);
  });

  it('commitMapShare updates and persists in one step (keyboard nudge)', () => {
    const { result } = renderHook(() => useMapShare());
    act(() => result.current.commitMapShare(55.6));
    expect(result.current.mapShare).toBe(55.6);
    expect(stored()).toBe('56');
  });

  it('keeps two mounted hooks in sync (same-tab write notifies listeners)', () => {
    const a = renderHook(() => useMapShare());
    const b = renderHook(() => useMapShare());
    act(() => a.result.current.commitMapShare(70));
    expect(b.result.current.mapShare).toBe(70);
  });
});
