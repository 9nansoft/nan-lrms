/**
 * Data-quality bounds, not clinical thresholds: a value outside these cannot
 * be a real measurement, so it is a mapping or entry error and must not be
 * stored. Severity interpretation belongs elsewhere.
 */
export const HB_G_DL_PLAUSIBLE_MAX = 25;

export const HCT_PCT_PLAUSIBLE_MIN = 5;
export const HCT_PCT_PLAUSIBLE_MAX = 75;

export function plausibleHbGDl(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value > 0 && value <= HB_G_DL_PLAUSIBLE_MAX ? value : null;
}

export function plausibleHctPct(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value >= HCT_PCT_PLAUSIBLE_MIN && value <= HCT_PCT_PLAUSIBLE_MAX ? value : null;
}
