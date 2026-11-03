// tests/unit/lib/reveal-bed-tile.test.ts
// "ดูเตียง →" on the urgent panel: bring the first tile of a stage into view
// and focus it — bed grid or unplaced section alike — honouring reduced motion.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { revealFirstBedTile } from '@/lib/reveal-bed-tile';
import { preferredScrollBehavior } from '@/lib/scroll-preview';

function tile(stage: string, id: string): HTMLElement {
  const a = document.createElement('article');
  a.dataset.stage = stage;
  a.dataset.testid = id;
  a.tabIndex = 0;
  return a;
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('revealFirstBedTile', () => {
  it('scrolls the FIRST matching tile (DOM order, unplaced section first) into view and focuses it', () => {
    const unplaced = tile('prolongedLatent', 'ward-unplaced-1');
    const bed = tile('prolongedLatent', 'bed-06');
    document.body.append(tile('active', 'bed-02'), unplaced, bed);
    const scroll = vi.fn();
    unplaced.scrollIntoView = scroll;
    bed.scrollIntoView = vi.fn();
    expect(revealFirstBedTile('prolongedLatent')).toBe(unplaced);
    expect(scroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
    expect(document.activeElement).toBe(unplaced);
    expect(bed.scrollIntoView).not.toHaveBeenCalled();
  });

  it('prefers-reduced-motion → an instant jump', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
    const t = tile('prolongedLatent', 'bed-06');
    t.scrollIntoView = vi.fn();
    document.body.append(t);
    revealFirstBedTile('prolongedLatent');
    expect(t.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
    expect(preferredScrollBehavior()).toBe('auto');
  });

  it('no matching tile → null, nothing moves', () => {
    document.body.append(tile('active', 'bed-02'));
    expect(revealFirstBedTile('prolongedLatent')).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });
});
