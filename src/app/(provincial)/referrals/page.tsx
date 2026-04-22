// Referrals — inter-hospital transfer tracking. Redesigned 2026-04-21 to
// match the dashboard's air-traffic-control aesthetic: cool-slate frame,
// flush white panels, navy accents, mono-tracking status chips, border-only
// pills in the shared risk palette (no pastel pills).
'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionLabel } from '@/components/dashboard/shared';
import { cn, formatThaiDate } from '@/lib/utils';
import { ArrowRightLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReferralListResponse } from '@/types/api';

interface StatusMeta {
  color: string;
  label: string;
}

const STATUS_META: Record<string, StatusMeta> = {
  INITIATED: { color: 'var(--ink-navy-dim)', label: 'รอดำเนินการ' },
  ACCEPTED: { color: 'var(--risk-low)', label: 'ตอบรับ' },
  IN_TRANSIT: { color: 'var(--risk-medium)', label: 'กำลังเดินทาง' },
  ARRIVED: { color: 'var(--accent-navy)', label: 'ถึงแล้ว' },
  REJECTED: { color: 'var(--risk-high)', label: 'ปฏิเสธ' },
};

const URGENCY_META: Record<string, StatusMeta> = {
  ROUTINE: { color: 'var(--ink-navy-muted)', label: 'ปกติ' },
  URGENT: { color: 'var(--risk-medium)', label: 'เร่งด่วน' },
  EMERGENCY: { color: 'var(--risk-high)', label: 'ฉุกเฉิน' },
};

function Pill({ meta, fallback }: { meta: StatusMeta | undefined; fallback: string }) {
  const m = meta ?? { color: 'var(--ink-navy-muted)', label: fallback };
  return (
    <span
      className="inline-block border px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold tracking-[0.06em]"
      style={{ color: m.color, borderColor: m.color, background: 'transparent' }}
    >
      {m.label}
    </span>
  );
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'ALL' },
  { value: 'INITIATED', label: 'รอดำเนินการ' },
  { value: 'ACCEPTED', label: 'ตอบรับ' },
  { value: 'IN_TRANSIT', label: 'กำลังเดินทาง' },
  { value: 'ARRIVED', label: 'ถึงแล้ว' },
  { value: 'REJECTED', label: 'ปฏิเสธ' },
];

export default function ReferralsPage() {
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'ส่งต่อ' },
  ]);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (statusFilter) params.set('status', statusFilter);
    return params.toString();
  }, [page, statusFilter]);

  const { data, isLoading, error } = useSWR<ReferralListResponse>(
    `/api/dashboard/referrals/list?${queryParams}`,
    { refreshInterval: 30000 },
  );

  if (isLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลการส่งต่อ..." />;
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        style={{ color: 'var(--ink-navy-muted)' }}
      >
        <ArrowRightLeft className="mb-3 h-10 w-10 opacity-40" />
        <p className="font-mono text-[11px] text-red-600">
          เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่
        </p>
      </div>
    );
  }

  const referrals = data?.referrals ?? [];
  const pagination = data?.pagination ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  // Counts across current page
  const counts = useMemo(() => {
    const c = { initiated: 0, accepted: 0, inTransit: 0, arrived: 0, rejected: 0 };
    for (const r of referrals) {
      if (r.status === 'INITIATED') c.initiated += 1;
      else if (r.status === 'ACCEPTED') c.accepted += 1;
      else if (r.status === 'IN_TRANSIT') c.inTransit += 1;
      else if (r.status === 'ARRIVED') c.arrived += 1;
      else if (r.status === 'REJECTED') c.rejected += 1;
    }
    return c;
  }, [referrals]);

  return (
    <div
      style={{
        color: 'var(--ink-navy)',
        background: 'var(--surface-cool)',
        zoom: 1.15,
      }}
    >
      {/* Header strip */}
      <div
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-white px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-navy-muted)]">
            PROVINCIAL REGISTRY · REFERRALS
          </div>
          <h1
            className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight"
            style={{ color: 'var(--ink-navy)' }}
          >
            การส่งต่อ
          </h1>
        </div>
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          ส่งต่อระหว่างโรงพยาบาลทั้งจังหวัด ·{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
            {pagination.total}
          </span>{' '}
          รายการ
        </p>
      </div>

      {/* 01 — Page-level status strip */}
      <div
        className="grid bg-white"
        style={{
          gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
          borderBottom: '1px solid var(--rule-strong)',
        }}
      >
        {(
          [
            { k: 'INITIATED', v: counts.initiated, color: 'var(--ink-navy-dim)' },
            { k: 'ACCEPTED', v: counts.accepted, color: 'var(--risk-low)' },
            { k: 'IN-TRANSIT', v: counts.inTransit, color: 'var(--risk-medium)' },
            { k: 'ARRIVED', v: counts.arrived, color: 'var(--accent-navy)' },
            { k: 'REJECTED', v: counts.rejected, color: 'var(--risk-high)' },
          ] as const
        ).map((c, i) => (
          <div
            key={c.k}
            className="flex flex-col gap-0.5 px-4 py-3"
            style={{
              borderLeft: `2px solid ${c.color}`,
              borderRight: i < 4 ? '1px solid var(--rule-strong)' : undefined,
            }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
              {c.k}
            </div>
            <div
              className="font-mono text-2xl font-semibold leading-none tabular-nums"
              style={{ color: 'var(--ink-navy)' }}
            >
              {c.v}
            </div>
          </div>
        ))}
      </div>

      {/* 02 — Filter + table */}
      <div className="bg-white px-5 pt-4 pb-5">
        <SectionLabel
          idx={2}
          right={
            <span>
              PAGE {pagination.page}/{pagination.totalPages} · {pagination.total} TOTAL
            </span>
          }
        >
          Referral queue
        </SectionLabel>

        {/* Filter chips */}
        <div
          className="mt-2 flex flex-wrap items-center gap-2 border bg-white px-3 py-2"
          style={{ borderColor: 'var(--rule-strong)', borderBottom: 'none' }}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-navy-muted)]">
            STATUS:
          </span>
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value || 'all'}
                onClick={() => {
                  setStatusFilter(opt.value);
                  setPage(1);
                }}
                className={cn(
                  'rounded-sm border bg-white px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors',
                  active ? 'font-semibold' : 'font-normal',
                )}
                style={{
                  borderColor: active ? 'var(--accent-navy)' : 'var(--rule-strong)',
                  color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  background: active ? 'var(--accent-navy-soft)' : 'white',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div
          className="border border-t-0 bg-white overflow-x-auto"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div
            className="grid gap-2 border-b border-[var(--rule-strong)] px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
            style={{ gridTemplateColumns: '1.3fr 1.3fr 110px 80px 2fr 110px 110px' }}
          >
            <div>FROM</div>
            <div>TO</div>
            <div>STATUS</div>
            <div>URGENCY</div>
            <div>REASON</div>
            <div>INITIATED</div>
            <div>ARRIVED</div>
          </div>

          {referrals.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <ArrowRightLeft className="mx-auto mb-2 h-8 w-8 text-[var(--ink-navy-muted)] opacity-50" />
              <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
                ไม่พบรายการส่งต่อ
              </p>
            </div>
          ) : (
            referrals.map((r) => (
              <div
                key={r.id}
                className="grid items-center gap-2 border-b px-3 py-2 transition-colors hover:bg-[var(--accent-navy-soft)]"
                style={{
                  gridTemplateColumns: '1.3fr 1.3fr 110px 80px 2fr 110px 110px',
                  borderColor: 'var(--rule-hair)',
                  minHeight: 44,
                }}
              >
                <div className="truncate text-[13px] text-[var(--ink-navy)]">
                  {r.fromHospital}
                </div>
                <div className="truncate text-[13px] font-medium text-[var(--ink-navy)]">
                  {r.toHospital}
                </div>
                <div>
                  <Pill meta={STATUS_META[r.status]} fallback={r.status} />
                </div>
                <div>
                  <Pill meta={URGENCY_META[r.urgencyLevel]} fallback={r.urgencyLevel} />
                </div>
                <div className="truncate text-[12px] text-[var(--ink-navy-dim)]" title={r.reason ?? ''}>
                  {r.reason ?? '—'}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[var(--ink-navy-dim)]">
                  {formatThaiDate(r.initiatedAt)}
                </div>
                <div className="font-mono text-[11px] tabular-nums text-[var(--ink-navy-dim)]">
                  {r.arrivedAt ? (
                    formatThaiDate(r.arrivedAt)
                  ) : (
                    <span className="text-[var(--ink-navy-muted)]">—</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div
            className="mt-3 flex items-center justify-between font-mono text-[10px] tracking-[0.08em]"
            style={{ color: 'var(--ink-navy-muted)' }}
          >
            <span>
              SHOWING{' '}
              <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
                {(pagination.page - 1) * pagination.perPage + 1}–
                {Math.min(pagination.page * pagination.perPage, pagination.total)}
              </span>{' '}
              OF{' '}
              <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
                {pagination.total}
              </span>
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-sm border bg-white px-2.5 py-1 text-[10px] transition-colors hover:bg-[var(--accent-navy-soft)] disabled:opacity-40"
                style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-navy-dim)' }}
              >
                <ChevronLeft className="h-3 w-3" />
                PREV
              </button>
              <span
                className="rounded-sm px-2.5 py-1 font-semibold tabular-nums"
                style={{
                  background: 'var(--accent-navy-soft)',
                  color: 'var(--accent-navy)',
                }}
              >
                {pagination.page}/{pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="inline-flex items-center gap-1 rounded-sm border bg-white px-2.5 py-1 text-[10px] transition-colors hover:bg-[var(--accent-navy-soft)] disabled:opacity-40"
                style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-navy-dim)' }}
              >
                NEXT
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
