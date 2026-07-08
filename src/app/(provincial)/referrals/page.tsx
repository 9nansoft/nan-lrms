// Referrals — inter-hospital transfer board. Redesigned 2026-07-08:
// ops KPI strip (today / 7d / emergency / high-risk / overdue) + DB-wide
// status breakdown from the API's global counts, patient context per row
// (masked name, HN, GA, ANC risk), refer number + ICD-10, and SLA aging on
// INITIATED rows. Keeps the dashboard's air-traffic-control aesthetic:
// cool-slate frame, flush white panels, navy accents, mono-tracking chips.
'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SectionLabel } from '@/components/dashboard/shared';
import { cn, formatThaiDate, formatThaiTime } from '@/lib/utils';
import { formatRelativeAge } from '@/lib/relative-time';
import { maskName } from '@/lib/pii-mask';
import { classifyReferralAge, type ReferralAgeClass } from '@/config/referral-sla';
import {
  AgeChip,
  Pill,
  RiskChip,
  STATUS_META,
  URGENCY_META,
} from '@/components/referrals/chips';
import { ReferralDetailDialog } from '@/components/referrals/ReferralDetailDialog';
import { ArrowRightLeft, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import type { ProvincialReferralListItem, ReferralListResponse } from '@/types/api';

const URGENCY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'ALL' },
  { value: 'ROUTINE', label: 'ปกติ' },
  { value: 'URGENT', label: 'เร่งด่วน' },
  { value: 'EMERGENCY', label: 'ฉุกเฉิน' },
];

const RANGE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
];

const GRID_COLUMNS = '92px 1.7fr 1.7fr 104px 84px 74px 1.4fr 158px';

const EMPTY_STATUS_COUNTS = {
  initiated: 0,
  accepted: 0,
  inTransit: 0,
  arrived: 0,
  rejected: 0,
  total: 0,
};
const EMPTY_OPS_COUNTS = { today: 0, last7d: 0, emergencyActive: 0, highRisk: 0, overdue: 0 };

export default function ReferralsPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ส่งต่อ' }]);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState('');
  const [rangeFilter, setRangeFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState('');
  // Debounced term actually sent to the server (see pregnancies page — the
  // server matches refer number contains, HN prefix, or decrypted name).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(handle);
  }, [search]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (statusFilter) params.set('status', statusFilter);
    if (urgencyFilter) params.set('urgency', urgencyFilter);
    if (rangeFilter) params.set('range', rangeFilter);
    if (overdueOnly) params.set('overdue', '1');
    if (debouncedQuery) params.set('q', debouncedQuery);
    return params.toString();
  }, [page, statusFilter, urgencyFilter, rangeFilter, overdueOnly, debouncedQuery]);

  const { data, isLoading, error, mutate } = useSWR<ReferralListResponse>(
    `/api/dashboard/referrals/list?${queryParams}`,
    {
      refreshInterval: 30000,
      // Filter/page changes swap the SWR key; keep showing the previous rows
      // instead of flashing the full-page spinner (constitution V).
      keepPreviousData: true,
      onSuccess: () => setLastUpdated(new Date()),
    },
  );

  const referrals = useMemo(() => data?.referrals ?? [], [data]);
  const statusCounts = data?.statusCounts ?? EMPTY_STATUS_COUNTS;
  const opsCounts = data?.opsCounts ?? EMPTY_OPS_COUNTS;
  const pagination = data?.pagination ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  const hasActiveFilters =
    Boolean(statusFilter || urgencyFilter || rangeFilter || debouncedQuery) || overdueOnly;

  const clearFilters = () => {
    setStatusFilter('');
    setUrgencyFilter('');
    setRangeFilter('');
    setOverdueOnly(false);
    setSearch('');
    setDebouncedQuery('');
    setPage(1);
  };

  if (isLoading && !data) {
    return <LoadingState message="กำลังโหลดข้อมูลการส่งต่อ..." />;
  }

  if (error && !data) {
    return (
      <ErrorState
        message="เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"
        detail={error instanceof Error ? error.message : String(error)}
        onRetry={() => mutate()}
      />
    );
  }

  const statusCells = [
    { k: 'INITIATED' as const, v: statusCounts.initiated },
    { k: 'ACCEPTED' as const, v: statusCounts.accepted },
    { k: 'IN_TRANSIT' as const, v: statusCounts.inTransit },
    { k: 'ARRIVED' as const, v: statusCounts.arrived },
    { k: 'REJECTED' as const, v: statusCounts.rejected },
  ];

  const opsCells: Array<{
    testId: string;
    k: string;
    labelTh: string;
    v: number;
    color: string;
    active?: boolean;
    onClick?: () => void;
  }> = [
    {
      testId: 'kpi-today',
      k: 'TODAY',
      labelTh: 'เริ่มส่งต่อวันนี้',
      v: opsCounts.today,
      color: 'var(--accent-navy)',
      active: rangeFilter === 'today',
      onClick: () => {
        setRangeFilter((r) => (r === 'today' ? '' : 'today'));
        setPage(1);
      },
    },
    {
      testId: 'kpi-7d',
      k: '7 DAYS',
      labelTh: 'ช่วง 7 วัน',
      v: opsCounts.last7d,
      color: 'var(--ink-navy-dim)',
      active: rangeFilter === '7d',
      onClick: () => {
        setRangeFilter((r) => (r === '7d' ? '' : '7d'));
        setPage(1);
      },
    },
    {
      testId: 'kpi-emergency',
      k: 'EMERGENCY',
      labelTh: 'ฉุกเฉิน ยังไม่ถึง',
      v: opsCounts.emergencyActive,
      color: 'var(--risk-high)',
      active: urgencyFilter === 'EMERGENCY',
      onClick: () => {
        setUrgencyFilter((u) => (u === 'EMERGENCY' ? '' : 'EMERGENCY'));
        setPage(1);
      },
    },
    {
      testId: 'kpi-highrisk',
      k: 'HIGH-RISK',
      labelTh: 'ครรภ์เสี่ยง (HR1-3)',
      v: opsCounts.highRisk,
      color: 'var(--risk-medium)',
    },
    {
      testId: 'kpi-overdue',
      k: 'OVERDUE',
      labelTh: 'ค้างเกิน 24 ชม.',
      v: opsCounts.overdue,
      color: 'var(--risk-medium)',
      active: overdueOnly,
      onClick: () => {
        setOverdueOnly((o) => !o);
        setPage(1);
      },
    },
  ];

  return (
    <div style={{ color: 'var(--ink-navy)', background: 'var(--surface-cool)' }}>
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
            className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight"
            style={{ color: 'var(--ink-navy)' }}
          >
            การส่งต่อ
          </h1>
        </div>
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          ส่งต่อระหว่างโรงพยาบาลทั้งจังหวัด ·{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
            {statusCounts.total}
          </span>{' '}
          รายการ
        </p>
        <p className="ml-auto font-mono text-[10px] tracking-[0.08em] text-[var(--ink-navy-muted)]">
          อัปเดตล่าสุด{' '}
          <span className="tabular-nums text-[var(--ink-navy-dim)]">
            {lastUpdated ? formatThaiTime(lastUpdated) : '—'}
          </span>{' '}
          · รีเฟรชอัตโนมัติทุก 30 วิ
        </p>
      </div>

      {/* 01 — Operational KPI strip (DB-wide fixed windows; cells filter the queue) */}
      <div
        className="grid grid-cols-2 bg-white sm:grid-cols-5"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        {opsCells.map((c, i) => {
          const CellTag = c.onClick ? 'button' : 'div';
          return (
            <CellTag
              key={c.k}
              data-testid={c.testId}
              onClick={c.onClick}
              aria-pressed={c.onClick ? c.active : undefined}
              className={cn(
                'flex flex-col gap-0.5 px-4 py-3 text-left',
                c.onClick && 'cursor-pointer transition-colors hover:bg-[var(--accent-navy-soft)]',
              )}
              style={{
                borderLeft: `2px solid ${c.color}`,
                borderRight: i < opsCells.length - 1 ? '1px solid var(--rule-strong)' : undefined,
                background: c.active ? 'var(--accent-navy-soft)' : undefined,
              }}
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
                {c.k}
              </div>
              <div
                className="font-mono text-2xl font-semibold leading-none tabular-nums"
                style={{
                  color: c.v > 0 && c.color === 'var(--risk-high)' ? c.color : 'var(--ink-navy)',
                }}
              >
                {c.v}
              </div>
              <div className="text-[10px] text-[var(--ink-navy-muted)]">{c.labelTh}</div>
            </CellTag>
          );
        })}
      </div>

      {/* 02 — Status breakdown (DB-wide; cells toggle the status filter) */}
      <div
        className="flex flex-wrap items-stretch gap-x-5 gap-y-1 bg-white px-5 py-2"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        <span className="self-center font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
          STATUS:
        </span>
        {statusCells.map((c) => {
          const meta = STATUS_META[c.k];
          const active = statusFilter === c.k;
          return (
            <button
              key={c.k}
              data-testid={`status-${c.k}`}
              aria-pressed={active}
              onClick={() => {
                setStatusFilter((s) => (s === c.k ? '' : c.k));
                setPage(1);
              }}
              className="flex items-baseline gap-1.5 border-b-2 px-1 py-1 transition-colors hover:bg-[var(--accent-navy-soft)]"
              style={{
                borderBottomColor: active ? meta.color : 'transparent',
              }}
            >
              <span
                className="font-mono text-lg font-semibold leading-none tabular-nums"
                style={{ color: c.v > 0 ? meta.color : 'var(--ink-navy-muted)' }}
              >
                {c.v}
              </span>
              <span className="font-mono text-[10px] tracking-[0.06em] text-[var(--ink-navy-dim)]">
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* 03 — Filters + queue */}
      <div className="bg-white px-5 pt-4 pb-5">
        <SectionLabel
          idx={3}
          right={
            <span>
              PAGE {pagination.page}/{pagination.totalPages} · {pagination.total} TOTAL
            </span>
          }
        >
          Referral queue
        </SectionLabel>

        {/* Filter bar */}
        <div
          className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 border bg-white px-3 py-2"
          style={{ borderColor: 'var(--rule-strong)', borderBottom: 'none' }}
        >
          {/* Search */}
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-navy-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา เลขที่ส่งต่อ / HN / ชื่อผู้ป่วย…"
              className="h-8 w-full rounded-sm border bg-white pl-8 pr-3 text-[12px] focus:border-[var(--accent-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-navy-soft)]"
              style={{ borderColor: 'var(--rule-strong)' }}
            />
          </div>

          {/* Urgency chips */}
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-navy-muted)]">
              URGENCY:
            </span>
            {URGENCY_OPTIONS.map((opt) => {
              const active = urgencyFilter === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  onClick={() => {
                    setUrgencyFilter(opt.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-sm border bg-white px-2 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors',
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

          {/* Range chips */}
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-navy-muted)]">
              PERIOD:
            </span>
            {RANGE_OPTIONS.map((opt) => {
              const active = rangeFilter === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  onClick={() => {
                    setRangeFilter(opt.value);
                    setPage(1);
                  }}
                  className={cn(
                    'rounded-sm border bg-white px-2 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors',
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

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-sm border px-2 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors hover:bg-[var(--accent-navy-soft)]"
              style={{ borderColor: 'var(--rule-strong)', color: 'var(--ink-navy-dim)' }}
            >
              <X className="h-3 w-3" />
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* Desktop table (md+) */}
        <div
          className="hidden border border-t-0 bg-white md:block"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div className="overflow-x-auto">
            <div className="min-w-[1080px]">
              <div
                className="grid gap-2 border-b border-[var(--rule-strong)] px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
                style={{ gridTemplateColumns: GRID_COLUMNS }}
              >
                <div>REF NO</div>
                <div>PATIENT</div>
                <div>FROM → TO</div>
                <div>STATUS</div>
                <div>URGENCY</div>
                <div>DX</div>
                <div>REASON</div>
                <div>INITIATED</div>
              </div>

              {referrals.length === 0 ? (
                <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearFilters} />
              ) : (
                referrals.map((r) => (
                  <ReferralRow
                    key={r.id}
                    referral={r}
                    onSelect={() => setSelectedReferralId(r.id)}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Mobile cards (below md) */}
        <div
          className="border border-t-0 bg-white md:hidden"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          {referrals.length === 0 ? (
            <EmptyState hasActiveFilters={hasActiveFilters} onClear={clearFilters} />
          ) : (
            referrals.map((r) => (
              <ReferralCard
                key={r.id}
                referral={r}
                onSelect={() => setSelectedReferralId(r.id)}
              />
            ))
          )}
        </div>

        <ReferralDetailDialog
          referralId={selectedReferralId}
          onClose={() => setSelectedReferralId(null)}
        />

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

function EmptyState({
  hasActiveFilters,
  onClear,
}: {
  hasActiveFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div className="px-3 py-10 text-center">
      <ArrowRightLeft className="mx-auto mb-2 h-8 w-8 text-[var(--ink-navy-muted)] opacity-50" />
      <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">ไม่พบรายการส่งต่อ</p>
      {hasActiveFilters ? (
        <button
          onClick={onClear}
          className="mt-3 inline-flex items-center gap-1 rounded-sm border bg-white px-2.5 py-1 font-mono text-[10px] tracking-[0.08em] transition-colors hover:bg-[var(--accent-navy-soft)]"
          style={{ borderColor: 'var(--rule-strong)', color: 'var(--accent-navy)' }}
        >
          <X className="h-3 w-3" />
          ล้างตัวกรอง
        </button>
      ) : (
        <p className="mt-1 text-[11px] text-[var(--ink-navy-muted)]">
          ยังไม่มีการส่งต่อระหว่างโรงพยาบาลในระบบ
        </p>
      )}
    </div>
  );
}

/** Patient cell — masked name + risk chip, then HN · GA on the second line. */
function PatientCell({ referral }: { referral: ProvincialReferralListItem }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="truncate text-[13px] font-medium text-[var(--ink-navy)]">
          {maskName(referral.patientName)}
        </span>
        <RiskChip level={referral.ancRiskLevel} />
      </div>
      <div className="font-mono text-[10px] text-[var(--ink-navy-muted)]">
        HN {referral.hn || '—'}
        {referral.gaWeeks != null && <> · GA {referral.gaWeeks}</>}
      </div>
    </div>
  );
}

/** Route cell — destination first (that's the actionable side), origin below. */
function RouteCell({ referral }: { referral: ProvincialReferralListItem }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[13px] font-medium text-[var(--ink-navy)]">
        → {referral.toHospital}
      </div>
      <div className="truncate text-[11px] text-[var(--ink-navy-muted)]">
        จาก {referral.fromHospital}
      </div>
    </div>
  );
}

function InitiatedCell({
  referral,
  age,
}: {
  referral: ProvincialReferralListItem;
  age: ReferralAgeClass;
}) {
  return (
    <div>
      <div className="font-mono text-[11px] tabular-nums text-[var(--ink-navy-dim)]">
        {formatThaiDate(referral.initiatedAt)} {formatThaiTime(referral.initiatedAt)}
      </div>
      <div className="mt-0.5">
        {age === 'fresh' ? (
          <span className="font-mono text-[10px] text-[var(--ink-navy-muted)]">
            {formatRelativeAge(referral.initiatedAt, 'th')}ที่แล้ว
          </span>
        ) : (
          <AgeChip age={age} initiatedAt={referral.initiatedAt} />
        )}
      </div>
    </div>
  );
}

function ReferralRow({
  referral,
  onSelect,
}: {
  referral: ProvincialReferralListItem;
  onSelect: () => void;
}) {
  const age = classifyReferralAge(referral.initiatedAt, referral.status);
  const emergency = referral.urgencyLevel === 'EMERGENCY';
  return (
    <div
      data-testid={`referral-row-${referral.id}`}
      data-urgency={referral.urgencyLevel}
      data-age={age}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="grid cursor-pointer items-center gap-2 border-b px-3 py-2 transition-colors hover:bg-[var(--accent-navy-soft)] focus:outline-none focus-visible:bg-[var(--accent-navy-soft)]"
      style={{
        gridTemplateColumns: GRID_COLUMNS,
        borderColor: 'var(--rule-hair)',
        borderLeft: `3px solid ${emergency ? 'var(--risk-high)' : 'transparent'}`,
        minHeight: 48,
      }}
    >
      <div
        className="truncate font-mono text-[11px] text-[var(--ink-navy-dim)]"
        title={referral.referNumber ?? ''}
      >
        {referral.referNumber ?? '—'}
      </div>
      <PatientCell referral={referral} />
      <RouteCell referral={referral} />
      <div>
        <Pill meta={STATUS_META[referral.status]} fallback={referral.status} />
      </div>
      <div>
        <Pill meta={URGENCY_META[referral.urgencyLevel]} fallback={referral.urgencyLevel} />
      </div>
      <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">
        {referral.diagnosisCode ?? '—'}
      </div>
      <div className="truncate text-[12px] text-[var(--ink-navy-dim)]" title={referral.reason ?? ''}>
        {referral.reason ?? '—'}
      </div>
      <InitiatedCell referral={referral} age={age} />
    </div>
  );
}

function ReferralCard({
  referral,
  onSelect,
}: {
  referral: ProvincialReferralListItem;
  onSelect: () => void;
}) {
  const age = classifyReferralAge(referral.initiatedAt, referral.status);
  const emergency = referral.urgencyLevel === 'EMERGENCY';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer border-b px-3 py-2.5 transition-colors hover:bg-[var(--accent-navy-soft)] focus:outline-none focus-visible:bg-[var(--accent-navy-soft)]"
      style={{
        borderColor: 'var(--rule-hair)',
        borderLeft: `3px solid ${emergency ? 'var(--risk-high)' : 'transparent'}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-[var(--ink-navy-dim)]">
          {referral.referNumber ?? '—'}
        </span>
        <div className="flex items-center gap-1.5">
          <Pill meta={URGENCY_META[referral.urgencyLevel]} fallback={referral.urgencyLevel} />
          <Pill meta={STATUS_META[referral.status]} fallback={referral.status} />
        </div>
      </div>
      <div className="mt-1.5">
        <PatientCell referral={referral} />
      </div>
      <div className="mt-1.5">
        <RouteCell referral={referral} />
      </div>
      {referral.reason && (
        <div className="mt-1 line-clamp-2 text-[12px] text-[var(--ink-navy-dim)]">
          {referral.diagnosisCode && (
            <span className="mr-1.5 font-mono text-[11px]">{referral.diagnosisCode}</span>
          )}
          {referral.reason}
        </div>
      )}
      <div className="mt-1.5 flex items-center justify-between">
        <span className="font-mono text-[10px] tabular-nums text-[var(--ink-navy-muted)]">
          {formatThaiDate(referral.initiatedAt)} {formatThaiTime(referral.initiatedAt)}
        </span>
        {age === 'fresh' ? (
          <span className="font-mono text-[10px] text-[var(--ink-navy-muted)]">
            {formatRelativeAge(referral.initiatedAt, 'th')}ที่แล้ว
          </span>
        ) : (
          <AgeChip age={age} initiatedAt={referral.initiatedAt} />
        )}
      </div>
    </div>
  );
}
