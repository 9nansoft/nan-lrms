// src/config/status-tone.ts
// One status-tone vocabulary → token classes. Replaces every ad-hoc
// `color-mix(in srgb, #hex …)` tint on the ward board and patient pages.
/** Semantic tone for status chips/dots (maps onto the direction-C tokens). */
export type StatusTone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral';

const BASE: Record<
  StatusTone,
  { tint: string; text: string; solid: string; border: string; accent: string }
> = {
  ok: {
    tint: 'bg-ok-tint',
    text: 'text-ok-text',
    solid: 'bg-ok',
    border: 'border-ok/40',
    accent: 'border-l-ok',
  },
  warn: {
    tint: 'bg-warn-tint',
    text: 'text-warn-text',
    solid: 'bg-warn',
    border: 'border-warn/40',
    accent: 'border-l-warn',
  },
  danger: {
    tint: 'bg-danger-tint',
    text: 'text-danger-text',
    solid: 'bg-danger',
    border: 'border-danger/40',
    accent: 'border-l-danger',
  },
  brand: {
    tint: 'bg-brand-soft',
    text: 'text-brand',
    solid: 'bg-brand',
    border: 'border-brand/30',
    accent: 'border-l-brand',
  },
  neutral: {
    tint: 'bg-surface-muted',
    text: 'text-ink-muted',
    solid: 'bg-ink-subtle',
    border: 'border-border',
    accent: 'border-l-ink-subtle',
  },
};

/** Every tone with the derived `chip` (border + tint + text, the pill recipe)
 *  and `dot` (the solid swatch) so no surface re-spells these strings. */
export const STATUS_TONE: Record<
  StatusTone,
  { tint: string; text: string; solid: string; border: string; accent: string; chip: string; dot: string }
> = Object.fromEntries(
  (Object.keys(BASE) as StatusTone[]).map((t) => {
    const b = BASE[t];
    return [t, { ...b, chip: `${b.border} ${b.tint} ${b.text}`, dot: b.solid }];
  }),
) as Record<StatusTone, (typeof BASE)[StatusTone] & { chip: string; dot: string }>;
