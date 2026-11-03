// When a list row is selected and its preview pane is stacked BELOW the list
// (narrow container), the preview is off-screen — bring it into view. Side by
// side, the preview is already visible, so nothing moves. Honors
// prefers-reduced-motion (instant jump instead of smooth scroll).
export function isStackedBelow(list: Pick<DOMRect, 'bottom'>, preview: Pick<DOMRect, 'top'>): boolean {
  return preview.top >= list.bottom - 1;
}

/** 'smooth', or 'auto' (an instant jump) under prefers-reduced-motion. */
export function preferredScrollBehavior(): ScrollBehavior {
  const reduce =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return reduce ? 'auto' : 'smooth';
}

export function scrollPreviewIntoViewIfStacked(list: HTMLElement | null, preview: HTMLElement | null): boolean {
  if (!list || !preview) return false;
  if (!isStackedBelow(list.getBoundingClientRect(), preview.getBoundingClientRect())) return false;
  preview.scrollIntoView?.({ behavior: preferredScrollBehavior(), block: 'start' });
  return true;
}
