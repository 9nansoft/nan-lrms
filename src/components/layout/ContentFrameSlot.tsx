// ContentFrameSlot — client wrapper that applies the provincial page-frame
// (centered 1400px max-width + padding) to every route EXCEPT those that
// render their own full-bleed chrome. Mirrors TopNavBarSlot's logic so the
// same routes are treated consistently.
'use client';

import { usePathname } from 'next/navigation';

// Exact-match routes that render full-bleed (their own padding / background).
const FULL_BLEED_ROUTES = new Set<string>(['/', '/pregnancies']);
// Prefix-match routes for dynamic children (e.g. /pregnancies/[journeyId]).
const FULL_BLEED_PREFIXES = ['/pregnancies/'];

function isFullBleed(pathname: string): boolean {
  if (FULL_BLEED_ROUTES.has(pathname)) return true;
  return FULL_BLEED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function ContentFrameSlot({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isFullBleed(pathname)) {
    return <>{children}</>;
  }
  return <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>;
}
