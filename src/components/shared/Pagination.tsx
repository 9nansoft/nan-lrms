// src/components/shared/Pagination.tsx
// Thai pager. The range comes ONLY from the server's pagination object
// (count-provenance rule) — never from rows.length.
'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationInfo } from '@/types/api';

const fmt = (n: number) => n.toLocaleString('en-US');
const BTN =
  'inline-flex h-10 items-center gap-1 rounded-lg border border-border bg-surface-card px-3 text-label text-ink hover:bg-brand-soft disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function Pagination({
  pagination,
  unit,
  onPageChange,
}: {
  pagination: PaginationInfo;
  unit: string;
  onPageChange: (page: number) => void;
}) {
  const { total, page, perPage, totalPages } = pagination;
  if (totalPages <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <nav aria-label="เปลี่ยนหน้า" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-label text-ink-muted">
      <span>
        แสดง{' '}
        <b className="tabular-nums text-ink">
          {fmt(from)}–{fmt(to)}
        </b>{' '}
        จาก <b className="tabular-nums text-ink">{fmt(total)}</b> {unit}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={BTN} disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          ก่อนหน้า
        </button>
        <span aria-current="page" className="rounded-lg bg-brand-soft px-3 py-2 font-semibold tabular-nums text-brand-strong">
          หน้า {page}/{totalPages}
        </span>
        <button type="button" className={BTN} disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}>
          ถัดไป
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
