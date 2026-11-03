import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { useRef } from 'react';
import { useCssHeightVar } from '@/hooks/useCssHeightVar';

class RO {
  static last: RO | null = null;
  constructor(public cb: () => void) {
    RO.last = this;
  }
  observe() {}
  disconnect() {}
}

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  useCssHeightVar(ref, '--t-h');
  return <div ref={ref} />;
}

const read = () => document.documentElement.style.getPropertyValue('--t-h');

describe('useCssHeightVar', () => {
  let height = 88;
  beforeEach(() => {
    height = 88;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height }) as DOMRect);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('publishes the height, follows resizes and cleans up', () => {
    vi.stubGlobal('ResizeObserver', RO);
    const { unmount } = render(<Probe />);
    expect(read()).toBe('88px');
    height = 120;
    act(() => RO.last!.cb());
    expect(read()).toBe('120px');
    unmount();
    expect(read()).toBe('');
  });

  it('without ResizeObserver it still publishes once (jsdom, old browsers)', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { unmount } = render(<Probe />);
    expect(read()).toBe('88px');
    unmount();
    expect(read()).toBe('');
  });
});
