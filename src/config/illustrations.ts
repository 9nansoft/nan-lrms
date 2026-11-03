// Static, pre-generated illustrations (scripts/illustrations/manifest.json).
// Qwen-Image-2.1 output; license signed off 2026-10-11 (see illustrationsEnabled).
export type IllustrationName = 'ward' | 'referral' | 'stale' | 'generic';

export const ILLUSTRATION_SRC: Record<IllustrationName, string> = {
  ward: '/illustrations/empty-ward.webp',
  referral: '/illustrations/empty-referral.webp',
  stale: '/illustrations/state-stale.webp',
  generic: '/illustrations/generic.webp',
};

/** Default ON — the Qwen Research License was signed off by the owner on
 *  2026-10-11. `NEXT_PUBLIC_ILLUSTRATIONS_ENABLED=false` is the kill switch
 *  (EmptyState then falls back to icons). */
export function illustrationsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ILLUSTRATIONS_ENABLED !== 'false';
}

/** Full-bleed decorative art (login hero, about header) — same kill switch,
 *  always rendered with alt="" inside an aria-hidden wrapper. about-header is
 *  abstract and must never be presented as Khon Kaen geography. */
export const HERO_ILLUSTRATION_SRC = {
  loginHero: '/illustrations/login-hero.webp',
  aboutHeader: '/illustrations/about-header.webp',
} as const;
