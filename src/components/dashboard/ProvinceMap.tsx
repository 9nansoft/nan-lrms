// ProvinceMap — public entry. Dynamically imports the Leaflet implementation
// so Next.js SSR doesn't try to evaluate `window`-dependent code on the
// server, and the ~200KB Leaflet bundle only ships when the map is rendered.
'use client';

import dynamic from 'next/dynamic';
import type { DashboardHospital } from '@/types/api';

export interface ProvinceMapProps {
  hospitals: DashboardHospital[];
  selected?: string | null;
  onSelect?: (hcode: string | null) => void;
  mode?: 'light' | 'kiosk';
  /** Visual density. 'mini' (default) = thinner boundary lines + smaller markers
   *  for inline dashboard use; 'full' = heavier strokes for a fullscreen dialog. */
  size?: 'mini' | 'full';
}

const ProvinceMapLeaflet = dynamic(() => import('./ProvinceMapLeaflet'), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-full w-full place-items-center"
      style={{ background: 'var(--surface-cool)' }}
    >
      <span className="font-mono text-[10px] tracking-[0.18em] text-[var(--ink-navy-muted)]">
        LOADING MAP…
      </span>
    </div>
  ),
});

export function ProvinceMap(props: ProvinceMapProps) {
  return <ProvinceMapLeaflet {...props} />;
}
