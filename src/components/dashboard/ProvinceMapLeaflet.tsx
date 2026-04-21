// Real-map implementation of the Province overview — uses Leaflet + OSM tiles
// so surrounding provinces are visible while Khon Kaen is highlighted in the
// middle. Hospital pins are placed at real OSM-verified coordinates where
// available, with district-centroid fallback for hospitals OSM didn't have.
//
// This file MUST NOT be imported at the module level from a server component
// because Leaflet accesses `window` on import. `ProvinceMap.tsx` dynamically
// imports this with `ssr: false` to satisfy Next.js SSR boundaries.
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { MapContainer, TileLayer, GeoJSON, Marker, Tooltip, ZoomControl } from 'react-leaflet';
import L, { type LatLngExpression, type LatLngBoundsExpression, type DivIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { DashboardHospital } from '@/types/api';
import { ConnectionStatus as ConnectionStatusEnum, HospitalLevel } from '@/types/domain';
import { KK_HOSPITALS } from '@/config/hospitals';
import { HOSPITAL_COORDS } from '@/data/kk-hospital-coords';
import { KK_GEOJSON } from '@/data/kk-province-geojson';

interface ProvinceMapLeafletProps {
  hospitals: DashboardHospital[];
  selected?: string | null;
  onSelect?: (hcode: string | null) => void;
  mode?: 'light' | 'kiosk';
  size?: 'mini' | 'full';
}

interface WeightPreset {
  amphoeWeight: number;
  boundaryWeight: number;
  /** Multiplier applied to the level+activity base radius to derive pin pixels. */
  pinMult: number;
  /** Minimum pin pixel size (floor). */
  pinMinPx: number;
  /** Maximum pin pixel size (cap so A_S with peak load doesn't dwarf the viewport). */
  pinMaxPx: number;
}

const WEIGHTS: Record<'mini' | 'full', WeightPreset> = {
  mini: {
    amphoeWeight: 0.5,
    boundaryWeight: 1.2,
    pinMult: 1.2,
    pinMinPx: 11,
    pinMaxPx: 20,
  },
  full: {
    amphoeWeight: 1,
    boundaryWeight: 2.5,
    pinMult: 2.2,
    pinMinPx: 20,
    pinMaxPx: 42,
  },
};

// ─── Hospital pin divIcon ───────────────────────────────────────────────
// Renders a real "hospital sign" marker: rounded square, colored by risk
// tier, with a medical cross glyph. Pulse halo + offline cross are driven
// by CSS classes in globals.css (`.kk-pin--*`).

const HOSPITAL_CROSS_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor"/>' +
  '</svg>';

function buildHospitalIcon(params: {
  color: string;
  sizePx: number;
  isHigh: boolean;
  isSelected: boolean;
  isOnline: boolean;
}): DivIcon {
  const { color, sizePx, isHigh, isSelected, isOnline } = params;
  const classes = [
    'kk-pin',
    isHigh ? 'kk-pin--high' : '',
    isSelected ? 'kk-pin--selected' : '',
    !isOnline ? 'kk-pin--offline' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const html =
    `<div class="${classes}" style="--kk-pin-color:${color};--kk-pin-size:${sizePx}px">` +
    '<div class="kk-pin__halo"></div>' +
    `<div class="kk-pin__body">${HOSPITAL_CROSS_SVG}</div>` +
    '</div>';
  // Oversize the icon bounds so the halo animation isn't clipped.
  const bound = sizePx * 2;
  return L.divIcon({
    html,
    className: '',
    iconSize: [bound, bound],
    iconAnchor: [bound / 2, bound / 2],
  });
}

// Khon Kaen province roughly spans 15.6–17.1 °N × 101.75–103.2 °E.
// Fit-bounds ensures the province fills the viewport regardless of aspect.
const KK_BOUNDS: LatLngBoundsExpression = [
  [15.55, 101.65],
  [17.15, 103.25],
];
const KK_CENTER: LatLngExpression = [16.35, 102.45];

const LEVEL_BASE_RADIUS: Partial<Record<HospitalLevel, number>> = {
  [HospitalLevel.A_S]: 11,
  [HospitalLevel.M1]: 9,
  [HospitalLevel.F2]: 7,
};
const DEFAULT_RADIUS = 7;

function activeCountRadiusBoost(total: number): number {
  if (total === 0) return 0;
  if (total < 3) return 1;
  if (total < 6) return 3;
  return 5;
}

function riskColor(
  live: DashboardHospital | undefined,
  palette: ReturnType<typeof buildPalette>,
): string {
  if (!live) return palette.idle;
  if (live.counts.high > 0) return palette.high;
  if (live.counts.medium > 0) return palette.med;
  if (live.counts.low > 0) return palette.low;
  return palette.idle;
}

function buildPalette(mode: 'light' | 'kiosk') {
  if (mode === 'kiosk') {
    return {
      boundaryStroke: '#6ba7e5',
      boundaryFill: 'rgba(107, 167, 229, 0.08)',
      amphoeStroke: 'rgba(107, 167, 229, 0.18)',
      high: '#e05c5c',
      med: '#e0a03a',
      low: '#4fb58a',
      idle: '#7f8fad',
      pinStroke: '#06121f',
      tooltipBg: '#0b1b2e',
      tooltipInk: '#e6ecf5',
    };
  }
  return {
    boundaryStroke: '#2b3a8c',
    boundaryFill: 'rgba(43, 58, 140, 0.06)',
    amphoeStroke: 'rgba(43, 58, 140, 0.18)',
    high: '#ef4444',
    med: '#eab308',
    low: '#22c55e',
    idle: '#94a3b8',
    pinStroke: '#ffffff',
    tooltipBg: '#ffffff',
    tooltipInk: '#0c1530',
  };
}

export default function ProvinceMapLeaflet({
  hospitals,
  selected,
  onSelect,
  mode = 'light',
  size = 'mini',
}: ProvinceMapLeafletProps) {
  const router = useRouter();
  const palette = buildPalette(mode);
  const w = WEIGHTS[size];

  // Live-data index by hcode so pins can reflect activity without depending on
  // the array order of HOSPITAL_COORDS.
  const liveByHcode = useMemo(
    () => new Map(hospitals.map((h) => [h.hcode, h])),
    [hospitals],
  );

  const tileUrl =
    mode === 'kiosk'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution =
    mode === 'kiosk'
      ? '© OpenStreetMap contributors, © CARTO'
      : '© OpenStreetMap contributors';

  const handleMarkerClick = (hcode: string) => {
    if (onSelect) onSelect(hcode === selected ? null : hcode);
    else router.push(`/hospitals/${hcode}`);
  };

  const hospitalPins = KK_HOSPITALS.map((h) => {
    const coord = HOSPITAL_COORDS[h.hcode];
    if (!coord) return null;
    const live = liveByHcode.get(h.hcode);
    // Pin pixel size scales with hospital level + active patient count, then
    // is clamped to [pinMinPx, pinMaxPx] for the chosen size preset.
    const baseRadius =
      (LEVEL_BASE_RADIUS[h.level] ?? DEFAULT_RADIUS) +
      activeCountRadiusBoost(live?.counts.total ?? 0);
    const rawSize = baseRadius * w.pinMult;
    const sizePx = Math.round(
      Math.min(w.pinMaxPx, Math.max(w.pinMinPx, rawSize)),
    );
    const color = riskColor(live, palette);
    const isSel = selected === h.hcode;
    const isOnline =
      live?.connectionStatus === undefined
        ? true
        : live.connectionStatus === ConnectionStatusEnum.ONLINE;
    const isHigh = !!live && live.counts.high > 0;
    const icon = buildHospitalIcon({
      color,
      sizePx,
      isHigh,
      isSelected: isSel,
      isOnline,
    });
    return {
      hcode: h.hcode,
      name: h.name,
      coord,
      level: h.level,
      live,
      sizePx,
      color,
      isSel,
      isOnline,
      isHigh,
      icon,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        background: mode === 'kiosk' ? '#06121f' : '#eef1f6',
        // Contain Leaflet's internal pane z-indexes (200–700) so they
        // can't render on top of modal dialogs or page chrome.
        isolation: 'isolate',
      }}
    >
      <MapContainer
        bounds={KK_BOUNDS}
        center={KK_CENTER}
        style={{ height: '100%', width: '100%', background: 'transparent' }}
        scrollWheelZoom
        zoomControl={false}
        attributionControl
        minZoom={7}
        maxZoom={13}
      >
        <TileLayer
          attribution={tileAttribution}
          url={tileUrl}
          opacity={mode === 'kiosk' ? 0.85 : 0.95}
        />

        {/* Amphoe outlines (subtle, interior hairlines) */}
        <GeoJSON
          data={KK_GEOJSON}
          style={{
            color: palette.amphoeStroke,
            weight: w.amphoeWeight,
            fillColor: palette.boundaryFill,
            fillOpacity: 1,
          }}
        />

        {/* Province-wide outline — drawn thicker, no fill, on top of tiles */}
        <GeoJSON
          data={KK_GEOJSON}
          style={{
            color: palette.boundaryStroke,
            weight: w.boundaryWeight,
            fill: false,
            dashArray: mode === 'kiosk' ? '4 3' : undefined,
          }}
          pane="overlayPane"
          interactive={false}
        />

        {/* Hospital markers — rendered as hospital-sign divIcons (risk-colored
             square with a medical cross). Pulse halo on HIGH risk via CSS. */}
        {hospitalPins.map((pin) => (
          <Marker
            key={pin.hcode}
            position={[pin.coord.lat, pin.coord.lon]}
            icon={pin.icon}
            eventHandlers={{
              click: () => handleMarkerClick(pin.hcode),
            }}
          >
            <Tooltip direction="top" offset={[0, -pin.sizePx / 2]} sticky>
              <div className="text-[12px]" style={{ color: palette.tooltipInk }}>
                <strong>{pin.name}</strong>
                <div>
                  {pin.level} ·{' '}
                  {pin.live ? `รวม ${pin.live.counts.total} ราย` : 'ยังไม่มีข้อมูล'}
                </div>
                {pin.live && pin.live.counts.high > 0 && (
                  <div style={{ color: palette.high }}>เสี่ยงสูง {pin.live.counts.high}</div>
                )}
                {!pin.isOnline && <div style={{ color: palette.high }}>OFFLINE</div>}
              </div>
            </Tooltip>
          </Marker>
        ))}

        <ZoomControl position="bottomright" />
      </MapContainer>
    </div>
  );
}
