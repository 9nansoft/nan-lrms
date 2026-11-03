// ProvinceMap — public entry. Dynamically imports the Leaflet implementation
// so Next.js SSR doesn't try to evaluate `window`-dependent code on the
// server, and the ~200KB Leaflet bundle only ships when the map is rendered.
'use client';

import dynamic from 'next/dynamic';
import type { DashboardHospital } from '@/types/api';
import { isNonReportingHcode } from '@/config/hospital-network';

export interface ProvinceMapProps {
  hospitals: DashboardHospital[];
  selected?: string | null;
  onSelect?: (hcode: string | null) => void;
  mode?: 'light' | 'kiosk';
  /** Visual density. 'mini' (default) = thinner boundary lines + smaller markers
   *  for inline dashboard use; 'full' = heavier strokes for a fullscreen dialog. */
  size?: 'mini' | 'full';
}

// System-reserved hcodes never belong on the GIS map even after they get
// auto-registered for onboarding/sandbox purposes. Same set as the access
// guard and the freshness counts (NON_REPORTING_HCODES), so the map, the
// strip and the dashboard fraction can never disagree. Filtered here at the
// wrapper so every map consumer (dashboard, admin, kiosk) gets it for free.

const ProvinceMapLeaflet = dynamic(() => import('./ProvinceMapLeaflet'), {
  ssr: false,
  loading: () => (
    <div
      className="grid h-full w-full place-items-center"
      style={{ background: 'var(--surface-cool)' }}
    >
      <span className="font-mono text-caption tracking-[0.18em] text-[var(--ink-navy-muted)]">
        LOADING MAP…
      </span>
    </div>
  ),
});

export function ProvinceMap(props: ProvinceMapProps) {
  const hospitals = props.hospitals.filter((h) => !isNonReportingHcode(h.hcode));
  return <ProvinceMapLeaflet {...props} hospitals={hospitals} />;
}
