// TopNavBarSlot — thin client wrapper that renders the shared TopNavBar.
// Kept as a separate file so the server layout can stay a server component
// (TopNavBar is a client component and needs a client boundary). Previously
// hid TopNavBar on `/`, but the dashboard now reuses the same chrome so the
// slot no longer needs any path-based branching.
'use client';

import { TopNavBar, type TopNavBarVariant } from '@/components/layout/TopNavBar';

export function TopNavBarSlot({ variant }: { variant?: TopNavBarVariant }) {
  return <TopNavBar variant={variant} />;
}
