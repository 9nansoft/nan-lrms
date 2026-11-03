// src/config/design-tokens.ts
// Direction C ("Warm Public Health") design tokens — the single source of
// truth. src/app/globals.css mirrors these as CSS custom properties and
// tests/unit/config/design-tokens.test.ts fails if the two drift. TS is the
// source because PNG renderers, Leaflet and Recharts cannot read CSS vars.
export const COLOR = {
  surfacePage: '#FBF8F3',
  surfaceCard: '#FFFFFF',
  surfaceMuted: '#F3EFE6',
  border: '#E8E1D2',
  ink: '#22223B',
  inkMuted: '#5C5C7A',
  inkSubtle: '#6B6B85',
  brand: '#2E3A87',
  brandStrong: '#232D6B',
  brandSoft: '#E4E6F4',
  riskHigh: '#C0392B',
  riskHighText: '#A1271B',
  riskHighTint: '#FDECEA',
  riskMedium: '#D08A00',
  riskMediumText: '#8A5A00',
  riskMediumTint: '#FFF6E0',
  riskLow: '#3F8F4F',
  riskLowText: '#2F6B3A',
  riskLowTint: '#EEF7EE',
} as const;

export type ColorToken = keyof typeof COLOR;

/** Data-freshness / status language reuses the risk language. */
export const STATUS = { ok: 'riskLow', warn: 'riskMedium', danger: 'riskHigh' } as const satisfies Record<
  string,
  ColorToken
>;

/** Text/background pairs components actually use; each must meet AA. */
export const CONTRAST_PAIRS: ReadonlyArray<readonly [ColorToken, ColorToken]> = [
  ['ink', 'surfacePage'],
  ['inkMuted', 'surfacePage'],
  ['inkSubtle', 'surfacePage'],
  ['ink', 'surfaceCard'],
  ['inkMuted', 'surfaceCard'],
  ['inkMuted', 'surfaceMuted'],
  ['riskHighText', 'riskHighTint'],
  ['riskMediumText', 'riskMediumTint'],
  ['riskLowText', 'riskLowTint'],
  ['surfaceCard', 'riskHigh'],
  ['surfaceCard', 'riskMediumText'],
  ['surfaceCard', 'riskLowText'],
  ['surfaceCard', 'brand'],
  ['brandStrong', 'brandSoft'],
];

export function cssVarName(token: ColorToken): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

function channel(hex: string, i: number): number {
  const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
}

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** Sarabun type scale in px (the html root is 18px, so rem would mislead).
 *  Thai stacks vowels/tone marks above and below the line — line-heights are
 *  deliberately generous. */
export interface TypeScaleEntry {
  px: number;
  lineHeight: number;
  /** Omitted for caption and body on purpose: a declared weight would override
   *  the weight inherited from a bold parent (e.g. a <th>). */
  weight?: number;
}

export const TYPE_SCALE = {
  caption: { px: 13, lineHeight: 1.5 },
  label: { px: 14, lineHeight: 1.5, weight: 500 },
  body: { px: 15, lineHeight: 1.65 },
  'body-lg': { px: 17, lineHeight: 1.6, weight: 500 },
  title: { px: 22, lineHeight: 1.35, weight: 600 },
  page: { px: 26, lineHeight: 1.3, weight: 700 },
  'kpi-sm': { px: 26, lineHeight: 1.15, weight: 700 },
  kpi: { px: 34, lineHeight: 1.15, weight: 700 },
} as const satisfies Record<string, TypeScaleEntry>;

export type TypeToken = keyof typeof TYPE_SCALE;

/** Smallest text allowed outside kiosk mode. */
export const MIN_TEXT_PX = TYPE_SCALE.caption.px;

/** A token colour at partial opacity, for canvases that cannot use
 *  Tailwind's `/alpha` syntax (Leaflet paths, inline legends).
 *  Expects a 6-digit `#rrggbb` hex; shorthand or rgb() strings are not parsed. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
