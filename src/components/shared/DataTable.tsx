'use client';
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import {
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export interface DataTableColumn<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  numeric?: boolean;
  className?: string;
}

/** A clickable row must say what it opens: an unlabelled focusable <tr> is
 *  announced as a bare run of cell text. The row keeps role="row" — giving a
 *  <tr> role="button" would drop it out of table navigation. */
type RowActivation<T> =
  | { onRowClick: (row: T) => void; rowLabel: (row: T) => string }
  | { onRowClick?: undefined; rowLabel?: undefined };

export type DataTableProps<T> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowRisk?: (row: T) => RiskLevel | null | undefined;
  loading?: boolean;
  empty?: ReactNode;
  caption?: string;
  /** Bounds the table height (px number or CSS length). The table then scrolls
   *  inside its own container and the header row sticks. Unbounded tables
   *  scroll with the page and claim no sticky header: inside an
   *  overflow-x wrapper a sticky <thead> would stick to a box that never
   *  scrolls vertically. */
  maxHeight?: number | string;
  /** data-* attributes for the <tr> (test ids, classification hooks). */
  rowAttrs?: (row: T) => Record<`data-${string}`, string | undefined>;
  /** Highlights a row (e.g. the hospital picked on the map). */
  isRowSelected?: (row: T) => boolean;
  /** Hover sync with another view (map pin highlight). */
  onRowPointerEnter?: (row: T) => void;
} & RowActivation<T>;

const RISK_ROW: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bg-ok-tint',
  [RiskLevel.MEDIUM]: 'bg-warn-tint',
  [RiskLevel.HIGH]: 'bg-danger-tint',
};

const SKELETON_ROWS = 3;

function activateOnKeys<T>(row: T, onRowClick: (row: T) => void) {
  return (e: KeyboardEvent<HTMLTableRowElement>) => {
    // Keys from a nested button/link/input belong to that control, not the row.
    if (e.target !== e.currentTarget) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault(); // Space would otherwise scroll the page
    onRowClick(row);
  };
}

const NESTED_CONTROL =
  'a[href],button,input,select,textarea,label,summary,[role="button"],[role="link"],[role="checkbox"]';

/** A click that landed in a nested control (edit/delete button, link, input)
 *  belongs to that control: the row must not also fire (a cell <Link> would
 *  otherwise navigate twice; "แก้ไข" inside a clickable row would also open it).
 *  Plain cell text (td/span targets) still activates the row. */
function clickOnRow<T>(row: T, onRowClick: (row: T) => void) {
  return (e: MouseEvent<HTMLTableRowElement>) => {
    const hit = e.target instanceof Element ? e.target.closest(NESTED_CONTROL) : null;
    if (hit && hit !== e.currentTarget && e.currentTarget.contains(hit)) return;
    onRowClick(row);
  };
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    columns,
    rows,
    rowKey,
    rowRisk,
    loading = false,
    empty,
    caption,
    maxHeight,
    onRowClick,
    rowLabel,
    rowAttrs,
    isRowSelected,
    onRowPointerEnter,
  } = props;
  const bounded = maxHeight !== undefined;
  return (
    <div
      data-slot="table-container"
      className={cn('relative w-full overflow-x-auto', bounded && 'overflow-y-auto')}
      style={bounded ? { maxHeight } : undefined}
    >
      <table
        data-slot="table"
        aria-busy={loading ? 'true' : undefined}
        aria-label={caption}
        className="w-full caption-bottom"
      >
        {caption && <TableCaption className="sr-only">{caption}</TableCaption>}
        <TableHeader className={cn('bg-surface-muted', bounded && 'sticky top-0 z-10')}>
          <TableRow>
            {columns.map((c) => (
              <TableHead
                key={c.key}
                className={cn('text-label text-ink-muted', c.numeric && 'text-right')}
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading &&
            Array.from({ length: SKELETON_ROWS }, (_, i) => (
              <TableRow key={`sk-${i}`} className="animate-pulse">
                {columns.map((c) => (
                  <TableCell key={c.key}>
                    <div className="h-4 rounded bg-surface-muted" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!loading && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-body text-ink-muted"
              >
                {empty ?? 'ไม่มีข้อมูล'}
              </TableCell>
            </TableRow>
          )}
          {!loading &&
            rows.map((row) => {
              const risk = rowRisk?.(row);
              const clickable = onRowClick && rowLabel;
              const selected = isRowSelected?.(row) ?? false;
              return (
                <TableRow
                  key={rowKey(row)}
                  {...rowAttrs?.(row)}
                  data-selected={selected ? 'true' : undefined}
                  className={cn(
                    risk && RISK_ROW[risk],
                    selected && 'bg-brand-soft',
                    clickable &&
                      'cursor-pointer outline-none hover:brightness-[0.98] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand',
                  )}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={clickable ? rowLabel(row) : undefined}
                  onClick={clickable ? clickOnRow(row, onRowClick) : undefined}
                  onKeyDown={clickable ? activateOnKeys(row, onRowClick) : undefined}
                  onPointerEnter={onRowPointerEnter ? () => onRowPointerEnter(row) : undefined}
                >
                  {columns.map((c) => (
                    <TableCell
                      key={c.key}
                      className={cn(
                        'whitespace-normal align-top text-body',
                        c.numeric && 'text-right tabular-nums',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
        </TableBody>
      </table>
    </div>
  );
}
