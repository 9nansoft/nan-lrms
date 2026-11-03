// src/components/shared/FilterBar.tsx
// Filter controls for list pages: every control has a visible Thai label and
// a 45px target (h-10 at the 18px root). Chips are aria-pressed buttons.
'use client';
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The one "ล้างตัวกรอง" button — used in the FilterBar and in filtered-empty states. */
export function ClearFiltersButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 text-label text-ink-muted hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        className,
      )}
    >
      <X aria-hidden="true" className="h-4 w-4" />
      ล้างตัวกรอง
    </button>
  );
}

export function FilterBar({ active = false, onClear, children }: { active?: boolean; onClear?: () => void; children: ReactNode }) {
  return (
    <div role="group" aria-label="ตัวกรองรายการ" className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-xl bg-surface-muted p-3">
      {children}
      {active && onClear && <ClearFiltersButton onClick={onClear} className="ml-auto" />}
    </div>
  );
}

export function SearchField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={cn('flex min-w-[220px] flex-1 flex-col gap-1', className)}>
      <span className="text-label text-ink-muted">{label}</span>
      <span className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-border bg-surface-card pl-9 pr-3 text-body text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </span>
    </label>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  testId,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  testId?: string;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1', className)}>
      <span className="text-label text-ink-muted">{label}</span>
      <select
        data-testid={testId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-10 max-w-[260px] rounded-lg border bg-surface-card px-2 text-body focus:outline-none focus:ring-2 focus:ring-brand/30',
          value ? 'border-brand text-brand-strong' : 'border-border text-ink',
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export interface ChipOption extends FilterOption {
  count?: number;
  testId?: string;
  /** Native tooltip explaining the option. */
  hint?: string;
}

export function FilterChips({
  label,
  value,
  onChange,
  options,
  hideLabel = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ChipOption[];
  hideLabel?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span aria-hidden="true" className={cn('text-label text-ink-muted', hideLabel && 'sr-only')}>
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value || 'all'}
              type="button"
              data-testid={o.testId}
              aria-pressed={active}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-full border px-3 text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
                active ? 'border-brand bg-brand-soft font-semibold text-brand-strong' : 'border-border bg-surface-card text-ink-muted hover:bg-surface-muted',
              )}
            >
              {o.label}
              {o.count != null && <span className="tabular-nums font-semibold text-ink">{o.count.toLocaleString('en-US')}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
