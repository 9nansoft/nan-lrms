// Province-map colours. Light mode derives from the design tokens; the kiosk
// set is the frozen dark palette (UI sub-project 2 does not redesign the
// kiosk), kept here byte-identical so components carry no hex literals.
import { COLOR, withAlpha } from '@/config/design-tokens';

export type MapMode = 'light' | 'kiosk';

export interface MapPalette {
  boundaryStroke: string;
  boundaryFill: string;
  amphoeStroke: string;
  high: string;
  med: string;
  low: string;
  idle: string;
  pinStroke: string;
  tooltipBg: string;
  tooltipInk: string;
}

const KIOSK: MapPalette = {
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

const LIGHT: MapPalette = {
  boundaryStroke: COLOR.brand,
  boundaryFill: withAlpha(COLOR.brand, 0.06),
  amphoeStroke: withAlpha(COLOR.brand, 0.18),
  high: COLOR.riskHigh,
  med: COLOR.riskMedium,
  low: COLOR.riskLow,
  idle: COLOR.inkSubtle,
  pinStroke: COLOR.surfaceCard,
  tooltipBg: COLOR.surfaceCard,
  tooltipInk: COLOR.ink,
};

export function mapPalette(mode: MapMode): MapPalette {
  return mode === 'kiosk' ? KIOSK : LIGHT;
}

export interface MapLegendTheme {
  bg: string;
  ink: string;
  inkMuted: string;
  border: string;
  pinBorder: string;
  /** Dot colour for "UNKNOWN / ยังไม่ sync". */
  unknown: string;
}

export function mapLegendTheme(mode: MapMode): MapLegendTheme {
  return mode === 'kiosk'
    ? {
        bg: 'rgba(11, 27, 46, 0.85)',
        ink: '#e6ecf5',
        inkMuted: 'rgba(230,236,245,0.7)',
        border: 'rgba(107,167,229,0.3)',
        pinBorder: '#06121f',
        unknown: '#94a3b8',
      }
    : {
        bg: withAlpha(COLOR.surfaceCard, 0.92),
        ink: COLOR.ink,
        inkMuted: COLOR.inkMuted,
        border: withAlpha(COLOR.brand, 0.22),
        pinBorder: COLOR.surfaceCard,
        unknown: COLOR.inkSubtle,
      };
}

/** Canvas behind the map tiles (also the loading placeholder). */
export function mapBackground(mode: MapMode): string {
  return mode === 'kiosk' ? '#06121f' : 'var(--surface-muted)';
}
