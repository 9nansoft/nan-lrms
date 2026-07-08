// Pregnancies — ANC registry. Rebuilt 2026-04-21 in the dashboard's
// air-traffic-control aesthetic: cool slate surfaces, navy accent section
// labels, mono tabular numerics, dense rows, Sarabun for Thai names.
'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { useSSE } from '@/hooks/useSSE';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionLabel, RiskBar } from '@/components/dashboard/shared';
import { cn, formatThaiDate, formatRelativeTime } from '@/lib/utils';
import { maskName } from '@/lib/pii-mask';
import {
  ANC_RISK_COLOR,
  ANC_RISK_LABEL_TH,
  ANC_RISK_FALLBACK_COLOR,
} from '@/config/anc-risk-display';
import { Baby, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import type { JourneyListResponse } from '@/types/api';

type AncRisk = 'LOW' | 'HR1' | 'HR2' | 'HR3';

// Shared ANC risk display tokens — see src/config/anc-risk-display.ts.
const RISK_COLOR = ANC_RISK_COLOR;
const RISK_LABEL_TH = ANC_RISK_LABEL_TH;

function RiskChip({ level }: { level: string }) {
  const color = RISK_COLOR[level as AncRisk] ?? ANC_RISK_FALLBACK_COLOR;
  return (
    <span
      data-risk={level}
      className="inline-block border px-1.5 py-0.5 text-center font-mono text-[11px] font-semibold tracking-[0.04em]"
      style={{ color, borderColor: color, background: 'transparent' }}
    >
      {level}
    </span>
  );
}

const RISK_OPTIONS: Array<{ value: '' | AncRisk; label: string }> = [
  { value: '', label: 'ทุกระดับ' },
  { value: 'LOW', label: 'LOW — ความเสี่ยงต่ำ' },
  { value: 'HR1', label: 'HR1 — ความเสี่ยง 1' },
  { value: 'HR2', label: 'HR2 — ความเสี่ยง 2' },
  { value: 'HR3', label: 'HR3 — ความเสี่ยงสูง' },
];

export default function PregnanciesPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ฝากครรภ์' }]);

  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<'' | AncRisk>('');
  const [search, setSearch] = useState('');
  // Debounced term actually sent to the server. Kept separate from `search`
  // (the raw input) so keystrokes don't fire a request each; the server does a
  // case-insensitive HN-prefix OR decrypted-name-contains match on ?q=.
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedQuery(search.trim());
      setPage(1); // a new search always restarts at the first page
    }, 400);
    return () => clearTimeout(handle);
  }, [search]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ stage: 'PREGNANCY', page: String(page), per_page: '20' });
    if (riskFilter) p.set('risk_level', riskFilter);
    if (debouncedQuery) p.set('q', debouncedQuery);
    return p.toString();
  }, [page, riskFilter, debouncedQuery]);

  const { data, isLoading, error, mutate } = useSWR<JourneyListResponse>(
    `/api/journeys?${queryParams}`,
    // keepPreviousData: paging/searching swaps the key but should not flash the
    // full-page loader — the previous rows stay until the next payload lands.
    { refreshInterval: 30000, keepPreviousData: true },
  );

  // Real-time refresh on webhook/sync activity. Without this the table waits
  // up to 30s for the poll interval, which feels broken during simulation.
  const refresh = useCallback(() => {
    void mutate();
  }, [mutate]);
  useSSE({ onPatientUpdate: refresh, onSyncComplete: refresh });

  const journeys = useMemo(() => data?.journeys ?? [], [data?.journeys]);

  // DB-wide risk breakdown over the stage+freshness set — independent of
  // pagination, the risk filter, and the search. Supplied by GET /api/journeys
  // as `counts`; null when the endpoint omits it, in which case the strip
  // renders em-dashes rather than misleading page-bound figures.
  const counts = data?.counts ?? null;

  if (isLoading) {
    return <LoadingState message="กำลังโหลดข้อมูลฝากครรภ์..." />;
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 text-center"
        style={{ color: 'var(--ink-navy-muted)' }}
      >
        <Baby className="mb-3 h-10 w-10 opacity-40" />
        <p className="font-mono text-[11px] text-red-600">
          เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่
        </p>
      </div>
    );
  }

  const pagination = data?.pagination ?? { total: 0, page: 1, perPage: 20, totalPages: 1 };

  return (
    <div
      style={{
        color: 'var(--ink-navy)',
        background: 'var(--surface-cool)',
        // Match the dashboard's font-size bump so /pregnancies reads at the
        // same visual weight. Dialogs portal out of this scope.
        zoom: 1.15,
      }}
    >
      {/* Page header strip — matches the dashboard's under-navbar control row:
          flush-to-edges white surface, navy rule underneath. */}
      <div
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-white px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--ink-navy-muted)]">
            PROVINCIAL REGISTRY · ANC
          </div>
          <h1
            className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight"
            style={{ color: 'var(--ink-navy)' }}
          >
            ฝากครรภ์ (ANC)
          </h1>
        </div>
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          ทะเบียนหญิงตั้งครรภ์ทั้งจังหวัด ·{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
            {pagination.total}
          </span>{' '}
          ราย
        </p>
      </div>

      {/* 01 — Province-wide risk strip (DB-wide counts, independent of paging,
          the risk filter, and the search) */}
      <div
        className="grid bg-white"
        style={{
          gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr',
          borderBottom: '1px solid var(--rule-strong)',
        }}
      >
        <div className="border-r border-[var(--rule-strong)] px-5 py-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
            PROVINCE-WIDE
          </div>
          <div className="mt-1.5 flex items-baseline gap-2.5">
            <div
              className="font-mono text-[36px] font-semibold leading-none tabular-nums"
              style={{ color: 'var(--ink-navy)', letterSpacing: '-0.02em' }}
            >
              {counts ? counts.total : '—'}
            </div>
            <div className="font-mono text-[11px] text-[var(--ink-navy-dim)]">หญิงตั้งครรภ์</div>
          </div>
          <div className="mt-2.5">
            <RiskBar
              low={counts?.low ?? 0}
              medium={counts ? counts.hr1 + counts.hr2 : 0}
              high={counts?.hr3 ?? 0}
              height={6}
            />
          </div>
        </div>
        {(
          [
            { k: 'LOW', v: counts?.low, color: 'var(--risk-low)' },
            { k: 'HR1', v: counts?.hr1, color: 'var(--risk-medium)' },
            { k: 'HR2', v: counts?.hr2, color: 'var(--risk-medium)' },
            { k: 'HR3', v: counts?.hr3, color: 'var(--risk-high)' },
          ] as const
        ).map((c) => (
          <div
            key={c.k}
            className="flex flex-col gap-0.5 px-4 py-3"
            style={{ borderLeft: `2px solid ${c.color}` }}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--ink-navy-muted)]">
              {c.k}
            </div>
            <div className="flex items-baseline gap-2">
              <div
                className="font-mono text-2xl font-semibold leading-none tabular-nums"
                style={{ color: 'var(--ink-navy)' }}
              >
                {c.v ?? '—'}
              </div>
              <div className="font-mono text-[10px] text-[var(--ink-navy-muted)]">
                {RISK_LABEL_TH[c.k as AncRisk]}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 02 — Filters + table */}
      <div className="bg-white px-5 pt-4 pb-5">
        <SectionLabel
          idx={2}
          right={
            <span>
              PAGE {pagination.page}/{pagination.totalPages} · {pagination.total} TOTAL
            </span>
          }
        >
          ANC Registry
        </SectionLabel>

        <div
          className="mt-2 flex flex-wrap items-center gap-2 border bg-white px-3 py-2"
          style={{ borderColor: 'var(--rule-strong)', borderBottom: 'none' }}
        >
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-navy-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ค้นหา ชื่อ / HN / โรงพยาบาล…"
              className="h-8 w-full rounded-sm border bg-white pl-8 pr-3 text-[12px] focus:border-[var(--accent-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-navy-soft)]"
              style={{ borderColor: 'var(--rule-strong)' }}
            />
          </div>

          {/* Risk filter chips */}
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--ink-navy-muted)]">
              FILTER:
            </span>
            {RISK_OPTIONS.map((opt) => {
              const active = riskFilter === opt.value;
              return (
                <button
                  key={opt.value || 'all'}
                  onClick={() => {
                    setRiskFilter(opt.value);
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
                  {opt.value || 'ALL'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table */}
        <div
          className="border border-t-0 bg-white overflow-x-auto"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          <div
            className="grid gap-2 border-b border-[var(--rule-strong)] px-3 py-2 font-mono text-[10px] tracking-[0.1em] text-[var(--ink-navy-muted)]"
            style={{ gridTemplateColumns: '120px 1fr 54px 56px 56px 64px 58px 140px 1fr' }}
          >
            <div>HN</div>
            <div>PATIENT</div>
            <div>AGE</div>
            <div>GA</div>
            <div>GRAV</div>
            <div>RISK</div>
            <div>ANC#</div>
            <div>LAST ANC</div>
            <div>HOSPITAL</div>
          </div>

          {journeys.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Baby className="mx-auto mb-2 h-8 w-8 text-[var(--ink-navy-muted)] opacity-50" />
              <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
                ไม่พบข้อมูลฝากครรภ์
              </p>
            </div>
          ) : (
            journeys.map((j) => (
              <Link
                key={j.id}
                href={`/pregnancies/${j.id}`}
                className="grid cursor-pointer items-center gap-2 border-b px-3 py-2 transition-colors hover:bg-[var(--accent-navy-soft)]"
                style={{
                  gridTemplateColumns: '120px 1fr 54px 56px 56px 64px 58px 140px 1fr',
                  borderColor: 'var(--rule-hair)',
                  height: 48,
                }}
              >
                <div className="font-mono text-[12px] font-semibold text-[var(--ink-navy)]">
                  {j.hn}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-[var(--ink-navy)]">
                    {maskName(j.name)}
                  </div>
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[var(--ink-navy-dim)]">
                  {j.age}
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[var(--ink-navy-dim)]">
                  {j.gaWeeks != null ? (
                    <>
                      {j.gaWeeks}
                      <span className="text-[10px] text-[var(--ink-navy-muted)]">w</span>
                    </>
                  ) : (
                    '—'
                  )}
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[var(--ink-navy-dim)]">
                  G{j.gravida}
                  {j.para > 0 && <span className="text-[var(--ink-navy-muted)]">P{j.para}</span>}
                </div>
                <div>
                  <RiskChip level={j.ancRiskLevel} />
                </div>
                <div className="font-mono text-[12px] tabular-nums text-[var(--ink-navy-dim)]">
                  {j.ancVisitCount}
                </div>
                <div className="text-[11px] text-[var(--ink-navy-dim)]">
                  {j.lastAncDate ? (
                    <div className="flex flex-col leading-tight">
                      <span>{formatThaiDate(j.lastAncDate)}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-navy-muted)]">
                        {formatRelativeTime(j.lastAncDate)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[var(--ink-navy-muted)]">—</span>
                  )}
                </div>
                <div className="truncate text-[12px] text-[var(--ink-navy-dim)]">
                  {j.hospitalName}
                </div>
              </Link>
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
