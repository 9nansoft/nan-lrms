// src/components/shared/ResponsiveTable.tsx
// A DataTable that turns into a card list when ITS OWN width is too narrow
// for the columns (CSS container query — no JS measurement, no flash; spec
// L3/L4). Both views render; CSS shows one. Row data-testids belong on the
// table rows (rowAttrs); cards must use their own ids ("…-card-…") so tests
// never see duplicates.
'use client';
import type { ReactNode } from 'react';
import { DataTable, type DataTableProps } from '@/components/shared/DataTable';
import { cn } from '@/lib/utils';

const FROM = {
  /** ~5 compact columns (hospital roster). */
  sm: { table: 'hidden @min-[560px]:block', cards: '@min-[560px]:hidden' },
  /** 6–7 columns (registries, referral queue, births). */
  lg: { table: 'hidden @min-[880px]:block', cards: '@min-[880px]:hidden' },
} as const;

export type ResponsiveTableProps<T> = DataTableProps<T> & {
  renderCard: (row: T) => ReactNode;
  /** Accessible name of the card list (the table is named by `caption`). */
  cardListLabel: string;
  tableFrom?: keyof typeof FROM;
};

export function ResponsiveTable<T>(props: ResponsiveTableProps<T>) {
  const { rows, rowKey, loading = false, empty, renderCard, cardListLabel, tableFrom = 'lg' } = props;
  if (!loading && rows.length === 0) return <>{empty ?? null}</>;
  const from = FROM[tableFrom];
  return (
    <div data-slot="responsive-table" className="@container w-full">
      <div data-view="table" className={from.table}>
        <DataTable<T> {...props} />
      </div>
      <ul aria-label={cardListLabel} aria-busy={loading ? 'true' : undefined} className={cn('flex flex-col gap-2', from.cards)}>
        {loading
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={`sk-${i}`} className="h-20 animate-pulse rounded-xl bg-surface-muted" />
            ))
          : rows.map((row) => <li key={rowKey(row)}>{renderCard(row)}</li>)}
      </ul>
    </div>
  );
}
