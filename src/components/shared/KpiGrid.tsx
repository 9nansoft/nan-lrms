// Responsive KPI tile grid: as many columns as fit at the minimum width, so a
// tile never shrinks until Thai labels break one word per line (2026-10-11
// visual review at 1024px with the 232px sidebar). Widths assume the 18px
// root: a 150px tile leaves ~114px for a text-kpi number with px-4 padding.
//
// Pass `count` (the number of tiles, 2-8) and the columns are balanced
// instead: 5 tiles lay out 3+2 and 6 tiles 3+3, never an orphan 4+1 / 4+2.
// Breakpoints are container queries, so the grid must sit inside an @container
// (every page layout provides one).
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { BALANCED_COLUMNS } from '@/components/shared/kpi-grid-columns';

const MIN = {
  sm: 'grid-cols-[repeat(auto-fit,minmax(150px,1fr))]',
  md: 'grid-cols-[repeat(auto-fit,minmax(200px,1fr))]',
} as const;

export function KpiGrid({
  min = 'sm',
  count,
  className,
  children,
}: {
  min?: keyof typeof MIN;
  /** Number of tiles; enables balanced rows for 2-8 tiles. */
  count?: number;
  className?: string;
  children: ReactNode;
}) {
  const balanced = count != null ? (BALANCED_COLUMNS[min] as Record<number, string>)[count] : undefined;
  return <div className={cn('grid gap-3', balanced ?? MIN[min], className)}>{children}</div>;
}
