'use client';

import { COLOR } from '@/config/design-tokens';
import { mapLegendTheme } from '@/config/map-palette';
import { MAP_LEGEND, type HospitalStatusTone } from '@/config/hospital-status';

// Kiosk keeps its dense war-room scale (frozen); light mode uses the 13px floor via classes.
const KIOSK_FONT = { heading: 9, item: 10 } as const;

export function MapStatusLegend({ mode }: { mode: 'light' | 'kiosk' }) {
  const isKiosk = mode === 'kiosk';
  const theme = mapLegendTheme(mode);
  const { bg, ink, inkMuted, border } = theme;
  const legend = MAP_LEGEND[mode];
  const dot: Record<HospitalStatusTone, string> = {
    ok: COLOR.riskLow,
    warn: COLOR.riskMedium,
    danger: COLOR.riskHigh,
    neutral: theme.unknown,
  };
  const items = legend.items.map((it) => ({ ...it, color: dot[it.tone] }));
  if (!isKiosk) {
    // Light mode: a strip BELOW the map pane (normal flow) so it can never
    // cover hospital markers — 2026-10-11 visual review.
    return (
      <div
        className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface-card px-3 py-2 text-caption text-ink"
        aria-label={legend.ariaLabel}
      >
        <span className="text-ink-muted">{legend.heading}</span>
        {items.map((it) => (
          <span key={it.label} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block shrink-0 rounded-full"
              style={{
                width: 8,
                height: 8,
                background: it.color,
                border: `1.5px solid ${theme.pinBorder}`,
                boxShadow: '0 0 0 0.5px rgba(0,0,0,0.15)',
              }}
            />
            <span className="font-semibold">{it.label}</span>
            <span className="text-ink-muted">·&nbsp;{it.sub}</span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <div
      className="absolute"
      style={{
        top: 8,
        left: 8,
        zIndex: 500,
        background: bg,
        color: ink,
        border: `1px solid ${border}`,
        borderRadius: 4,
        padding: '6px 8px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
        pointerEvents: 'none',
      }}
      aria-label={legend.ariaLabel}
    >
      <div
        style={{
          fontSize: KIOSK_FONT.heading,
          letterSpacing: '0.14em',
          color: inkMuted,
          marginBottom: 4,
        }}
      >
        {legend.heading}
      </div>
      <div className="flex flex-col gap-[2px]">
        {items.map((it) => (
          <div key={it.label} className="flex items-center gap-2">
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: it.color,
                border: `1.5px solid ${theme.pinBorder}`,
                boxShadow: '0 0 0 0.5px rgba(0,0,0,0.15)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: KIOSK_FONT.item, fontWeight: 600 }}>{it.label}</span>
            <span style={{ fontSize: KIOSK_FONT.item, color: inkMuted }}>·&nbsp;{it.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
