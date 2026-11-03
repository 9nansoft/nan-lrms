'use client';

import { cn } from '@/lib/utils';

export type OverviewMode = 'map' | 'list';

const MODES: ReadonlyArray<{ mode: OverviewMode; label: string }> = [
  { mode: 'map', label: 'แผนที่' },
  { mode: 'list', label: 'รายชื่อ' },
];

export function OverviewModeToggle({
  mode,
  onChange,
  onBrand = false,
}: {
  mode: OverviewMode;
  onChange: (mode: OverviewMode) => void;
  /** Drawn on the brand-coloured dialog header. */
  onBrand?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="มุมมองภาพรวมโรงพยาบาล"
      className={cn('inline-flex rounded-lg p-0.5', onBrand ? 'bg-white/10' : 'bg-surface-muted')}
    >
      {MODES.map((m) => {
        const active = m.mode === mode;
        return (
          <button
            key={m.mode}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(m.mode)}
            className={cn(
              'rounded-md px-3 py-1 text-label transition-colors',
              active
                ? onBrand
                  ? 'bg-white text-brand-strong'
                  : 'bg-surface-card text-brand shadow-soft'
                : onBrand
                  ? 'text-white hover:bg-white/20'
                  : 'text-ink-muted hover:text-brand',
            )}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
