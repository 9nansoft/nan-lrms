import { describe, it, expect, vi, afterEach } from 'vitest';
import { scrollPreviewIntoViewIfStacked } from '@/lib/scroll-preview';

function el(rect: Partial<DOMRect>) {
  const e = document.createElement('div');
  e.getBoundingClientRect = () => ({ top: 0, bottom: 0, ...rect }) as DOMRect;
  e.scrollIntoView = vi.fn();
  return e;
}
function motion(reduce: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: reduce }) as unknown as typeof window.matchMedia;
}

describe('scrollPreviewIntoViewIfStacked', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
  });

  it('smooth-scrolls the preview when it sits below the list', () => {
    motion(false);
    const preview = el({ top: 520 });
    expect(scrollPreviewIntoViewIfStacked(el({ top: 0, bottom: 500 }), preview)).toBe(true);
    expect(preview.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('jumps instantly under prefers-reduced-motion', () => {
    motion(true);
    const preview = el({ top: 520 });
    scrollPreviewIntoViewIfStacked(el({ bottom: 500 }), preview);
    expect(preview.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
  });

  it('does nothing when the preview is beside the list', () => {
    motion(false);
    const preview = el({ top: 0 });
    expect(scrollPreviewIntoViewIfStacked(el({ top: 0, bottom: 500 }), preview)).toBe(false);
    expect(preview.scrollIntoView).not.toHaveBeenCalled();
  });
});
