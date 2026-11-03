// Publishes an element's rendered height as a CSS custom property on <html>,
// so sticky content below a sticky header can offset itself (the dashboard's
// overview panel sits under AppHeader + StatusStrip, whose height varies with
// wrapping). In kiosk mode the header is display:none and the value is 0px.
'use client';

import { useLayoutEffect, type RefObject } from 'react';

export function useCssHeightVar(ref: RefObject<HTMLElement | null>, name: `--${string}`): void {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty(name, `${Math.round(el.getBoundingClientRect().height)}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return () => root.style.removeProperty(name);
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name]);
}
