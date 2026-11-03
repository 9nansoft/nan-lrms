// Referrals — inter-hospital transfer board on the shared list-page pattern
// (UI sub-project 4): ops KPI tiles (DB-wide fixed windows, click to filter),
// corridors + 7-day volume, a filterable queue that is a table when wide and
// cards when narrow, and the referral detail dialog. Data wiring unchanged.
'use client';

import { Suspense, useCallback, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { EmptyState } from '@/components/shared/EmptyState';
import { ClearFiltersButton, FilterBar, FilterChips, FilterSelect, SearchField } from '@/components/shared/FilterBar';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { Pagination } from '@/components/shared/Pagination';
import type { DataTableColumn } from '@/components/shared/DataTable';
import { AgeChip, Pill, RiskChip, STATUS_META, URGENCY_META } from '@/components/referrals/chips';
import { ReferralDetailDialog } from '@/components/referrals/ReferralDetailDialog';
import { useListData } from '@/hooks/useListData';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { formatThaiDate, formatThaiTime } from '@/lib/utils';
import { formatRelativeAge } from '@/lib/relative-time';
import { maskName } from '@/lib/pii-mask';
import { classifyReferralAge, REFERRAL_SLA, type ReferralAgeClass } from '@/config/referral-sla';
import { LIST_PAGE } from '@/config/list-page';
import type { ProvincialReferralListItem, ReferralInsightsResponse, ReferralListResponse } from '@/types/api';

const STATUSES = ['INITIATED', 'ACCEPTED', 'IN_TRANSIT', 'ARRIVED', 'REJECTED'] as const;
type StatusKey = (typeof STATUSES)[number];
const STATUS_COUNT_FIELD: Record<StatusKey, keyof ReferralListResponse['statusCounts']> = {
  INITIATED: 'initiated',
  ACCEPTED: 'accepted',
  IN_TRANSIT: 'inTransit',
  ARRIVED: 'arrived',
  REJECTED: 'rejected',
};

// Hint copy mirrors services/referral-list.ts SQL and config/referral-sla.ts.
const STATUS_TIPS: Record<StatusKey, string> = {
  INITIATED: 'ต้นทางส่งคำขอแล้ว ปลายทางยังไม่ตอบรับ — สถานะเริ่มต้นของทุกเคสจาก HOSxP',
  ACCEPTED: 'ปลายทางตอบรับเคสแล้ว รอการเดินทาง',
  IN_TRANSIT: 'กำลังเดินทางไปปลายทาง (ปัจจุบันต้นทางยังไม่ส่งสถานะนี้เข้าระบบ จึงมักเป็น 0)',
  ARRIVED: 'ถึงปลายทางแล้ว — ระบบยืนยันอัตโนมัติเมื่อพบผู้ป่วยเข้ารักษาที่โรงพยาบาลปลายทาง',
  REJECTED: 'ปลายทางปฏิเสธ พร้อมเหตุผลหรือโรงพยาบาลทางเลือก (ดูในรายละเอียดเคส)',
};

const URGENCY_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  ...(['ROUTINE', 'URGENT', 'EMERGENCY'] as const).map((k) => ({ value: k, label: URGENCY_META[k].label })),
];
const RANGE_OPTIONS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'today', label: 'วันนี้' },
  { value: '7d', label: '7 วัน' },
  { value: '30d', label: '30 วัน' },
];

const EMPTY_STATUS_COUNTS = { initiated: 0, accepted: 0, inTransit: 0, arrived: 0, rejected: 0, total: 0 };
const EMPTY_OPS_COUNTS = { today: 0, last7d: 0, emergencyActive: 0, highRisk: 0, overdue: 0 };

function PatientCell({ referral: r }: { referral: ProvincialReferralListItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="text-body font-semibold text-ink">{maskName(r.patientName)}</span>
        <RiskChip level={r.ancRiskLevel} />
      </span>
      <span className="text-caption tabular-nums text-ink-muted">
        HN {r.hn || '—'}
        {r.gaWeeks != null && <> · GA {r.gaWeeks}</>}
      </span>
    </div>
  );
}

/** Destination first (the actionable side), origin below. */
function RouteCell({ referral: r }: { referral: ProvincialReferralListItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-body font-medium text-ink">→ {r.toHospital}</span>
      <span className="text-caption text-ink-muted">จาก {r.fromHospital}</span>
    </div>
  );
}

function ReasonCell({ referral: r }: { referral: ProvincialReferralListItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-label tabular-nums text-ink">{r.diagnosisCode ?? '—'}</span>
      {r.reason && (
        <span className="line-clamp-2 text-caption text-ink-muted" title={r.reason}>
          {r.reason}
        </span>
      )}
    </div>
  );
}

function InitiatedCell({ referral: r, age }: { referral: ProvincialReferralListItem; age: ReferralAgeClass }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-label tabular-nums text-ink">
        {formatThaiDate(r.initiatedAt)} {formatThaiTime(r.initiatedAt)}
      </span>
      {age === 'fresh' ? (
        <span className="text-caption text-ink-muted">{formatRelativeAge(r.initiatedAt, 'th')}ที่แล้ว</span>
      ) : (
        <AgeChip age={age} initiatedAt={r.initiatedAt} />
      )}
    </div>
  );
}

const COLUMNS: DataTableColumn<ProvincialReferralListItem>[] = [
  { key: 'ref', header: 'เลขที่ส่งต่อ', cell: (r) => <span className="text-label tabular-nums text-ink">{r.referNumber ?? '—'}</span> },
  { key: 'patient', header: 'ผู้ป่วย', className: 'min-w-[180px]', cell: (r) => <PatientCell referral={r} /> },
  { key: 'route', header: 'ปลายทาง / ต้นทาง', className: 'min-w-[160px]', cell: (r) => <RouteCell referral={r} /> },
  {
    key: 'status',
    header: 'สถานะ',
    cell: (r) => (
      <span className="flex flex-col items-start gap-1">
        <Pill meta={STATUS_META[r.status]} fallback={r.status} />
        <Pill meta={URGENCY_META[r.urgencyLevel]} fallback={r.urgencyLevel} />
      </span>
    ),
  },
  { key: 'reason', header: 'การวินิจฉัย / เหตุผล', className: 'min-w-[160px]', cell: (r) => <ReasonCell referral={r} /> },
  {
    key: 'initiated',
    header: 'เริ่มส่งต่อ',
    cell: (r) => <InitiatedCell referral={r} age={classifyReferralAge(r.initiatedAt, r.status)} />,
  },
];

function ReferralCard({ referral: r, onSelect }: { referral: ProvincialReferralListItem; onSelect: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`referral-card-${r.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className="cursor-pointer rounded-xl border border-border px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-label tabular-nums text-ink-muted">{r.referNumber ?? '—'}</span>
        <span className="flex items-center gap-1.5">
          <Pill meta={URGENCY_META[r.urgencyLevel]} fallback={r.urgencyLevel} />
          <Pill meta={STATUS_META[r.status]} fallback={r.status} />
        </span>
      </div>
      <div className="mt-1.5">
        <PatientCell referral={r} />
      </div>
      <div className="mt-1.5">
        <RouteCell referral={r} />
      </div>
      {(r.reason || r.diagnosisCode) && (
        <div className="mt-1.5">
          <ReasonCell referral={r} />
        </div>
      )}
      <div className="mt-1.5">
        <InitiatedCell referral={r} age={classifyReferralAge(r.initiatedAt, r.status)} />
      </div>
    </div>
  );
}

function ReferralsBoard() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ส่งต่อ' }]);

  // Deep links from the dashboard land pre-filtered (?overdue=1, ?urgency=…).
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [urgencyFilter, setUrgencyFilter] = useState(searchParams.get('urgency') ?? '');
  const [rangeFilter, setRangeFilter] = useState('');
  const [toHospitalFilter, setToHospitalFilter] = useState('');
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === '1');
  const [selectedReferralId, setSelectedReferralId] = useState<string | null>(null);
  const resetPage = useCallback(() => setPage(1), [setPage]);
  // Server search: refer number contains, HN prefix, or decrypted name.
  const search = useDebouncedSearch(resetPage);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), per_page: String(LIST_PAGE.perPage) });
    if (statusFilter) p.set('status', statusFilter);
    if (urgencyFilter) p.set('urgency', urgencyFilter);
    if (rangeFilter) p.set('range', rangeFilter);
    if (toHospitalFilter) p.set('to_hospital_id', toHospitalFilter);
    if (overdueOnly) p.set('overdue', '1');
    if (search.query) p.set('q', search.query);
    return p.toString();
  }, [page, statusFilter, urgencyFilter, rangeFilter, toHospitalFilter, overdueOnly, search.query]);

  const { data, isLoading, error, mutate, lastUpdatedAt } = useListData<ReferralListResponse>(
    `/api/dashboard/referrals/list?${queryParams}`,
    LIST_PAGE.refreshMs,
  );
  // Corridors, 7-day volume, destination options — slow-changing aggregates.
  const { data: insights } = useSWR<ReferralInsightsResponse>('/api/dashboard/referrals/insights', {
    refreshInterval: LIST_PAGE.slowRefreshMs,
  });

  const referrals = useMemo(() => data?.referrals ?? [], [data]);
  const statusCounts = data?.statusCounts ?? EMPTY_STATUS_COUNTS;
  const opsCounts = data?.opsCounts ?? EMPTY_OPS_COUNTS;
  const pagination = data?.pagination ?? { total: 0, page: 1, perPage: LIST_PAGE.perPage, totalPages: 1 };
  const hasActiveFilters = Boolean(statusFilter || urgencyFilter || rangeFilter || toHospitalFilter || search.query) || overdueOnly;

  const clearFilters = () => {
    setStatusFilter('');
    setUrgencyFilter('');
    setRangeFilter('');
    setToHospitalFilter('');
    setOverdueOnly(false);
    search.clear();
    setPage(1);
  };
  /** A second click on the active tile/chip clears it; always back to page 1. */
  const toggle = (set: Dispatch<SetStateAction<string>>, v: string) => {
    set((cur) => (cur === v ? '' : v));
    setPage(1);
  };

  if (isLoading && !data) return <LoadingState message="กำลังโหลดข้อมูลการส่งต่อ..." />;
  if (error && !data) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดรายการส่งต่อได้"
        detail={error instanceof Error ? error.message : String(error)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={() => mutate()}
      />
    );
  }

  const showInsights = !!insights && (insights.corridors.length > 0 || insights.daily.some((d) => d.count > 0));
  const corridorMax = insights?.corridors[0]?.count || 1;
  const dailyMax = Math.max(...(insights?.daily ?? []).map((d) => d.count), 1);

  return (
    <ListPageLayout
      title="การส่งต่อ"
      subtitle={`ส่งต่อระหว่างโรงพยาบาลทั้งจังหวัด · ทั้งหมด ${statusCounts.total.toLocaleString('en-US')} รายการ`}
      updatedAt={lastUpdatedAt}
      stale={
        error
          ? {
              message: 'การเชื่อมต่อล้มเหลว — แสดงรายการส่งต่อเดิมจากแคช',
              onRetry: () => void mutate(),
              refreshSeconds: LIST_PAGE.refreshMs / 1000,
            }
          : null
      }
    >
      <SectionCard
        title="งานส่งต่อ"
        description="นับทั้งจังหวัดตามช่วงเวลาคงที่ ไม่ขึ้นกับตัวกรอง — กดการ์ดเพื่อกรองรายการ"
      >
        <KpiGrid count={5}>
          <KpiTile
            testId="kpi-today"
            label="เริ่มส่งต่อวันนี้"
            count={opsCounts.today}
            selected={rangeFilter === 'today'}
            onSelect={() => toggle(setRangeFilter, 'today')}
            hint={{
              title: 'การส่งต่อที่เริ่มวันนี้',
              body: 'จำนวนเคสส่งต่อทั้งจังหวัดที่เริ่มตั้งแต่เที่ยงคืนวันนี้ตามเวลาไทย ไม่ขึ้นกับตัวกรอง กดการ์ดเพื่อกรองรายการเป็นช่วงวันนี้',
            }}
          />
          <KpiTile
            testId="kpi-7d"
            label="ส่งต่อ 7 วันล่าสุด"
            count={opsCounts.last7d}
            selected={rangeFilter === '7d'}
            onSelect={() => toggle(setRangeFilter, '7d')}
            hint={{
              title: 'การส่งต่อช่วง 7 วันล่าสุด',
              body: 'จำนวนเคสส่งต่อที่เริ่มภายใน 7 วันที่ผ่านมา ใช้ดูปริมาณงานส่งต่อล่าสุดของเครือข่าย กดการ์ดเพื่อกรองรายการ',
            }}
          />
          <KpiTile
            testId="kpi-emergency"
            label="ฉุกเฉิน ยังไม่ถึงปลายทาง"
            count={opsCounts.emergencyActive}
            tone={opsCounts.emergencyActive > 0 ? 'high' : 'default'}
            selected={urgencyFilter === 'EMERGENCY'}
            onSelect={() => toggle(setUrgencyFilter, 'EMERGENCY')}
            hint={{
              title: 'เคสฉุกเฉินที่ยังไม่ถึงปลายทาง',
              body: `เคสความเร่งด่วนระดับ${URGENCY_META.EMERGENCY.label}ที่สถานะยังไม่เป็น "${STATUS_META.ARRIVED.label}" หรือ "${STATUS_META.REJECTED.label}" — ต้องติดตามจนถึงปลายทาง กดการ์ดเพื่อกรองเฉพาะเคสฉุกเฉิน`,
            }}
          />
          <KpiTile
            testId="kpi-highrisk"
            label="ผู้ป่วยครรภ์เสี่ยง (HR1–HR3)"
            count={opsCounts.highRisk}
            hint={{
              title: 'ผู้ป่วยส่งต่อที่ครรภ์เสี่ยง',
              body: 'เคสส่งต่อที่ผู้ป่วยมีระดับความเสี่ยง ANC ระดับ 1–3 (HR1–HR3) จากทะเบียนครรภ์ — สะท้อนสัดส่วนเคสซับซ้อนในงานส่งต่อ',
            }}
          />
          <KpiTile
            testId="kpi-overdue"
            label={`ค้างเกิน ${REFERRAL_SLA.overdueAfterHours} ชม.`}
            count={opsCounts.overdue}
            tone={opsCounts.overdue > 0 ? 'warn' : 'default'}
            selected={overdueOnly}
            onSelect={() => {
              setOverdueOnly((o) => !o);
              setPage(1);
            }}
            hint={{
              title: `ส่งต่อค้างเกิน ${REFERRAL_SLA.overdueAfterHours} ชั่วโมง`,
              body: `เคสที่ยังเป็น "${STATUS_META.INITIATED.label}" (ปลายทางยังไม่ตอบรับ) นานเกิน ${REFERRAL_SLA.overdueAfterHours} ชม. ตามเกณฑ์ SLA — ควรเร่งประสานปลายทาง กดการ์ดเพื่อกรองรายการค้าง`,
            }}
          />
        </KpiGrid>
      </SectionCard>

      {showInsights && insights && (
        <div className="grid grid-cols-1 gap-5 @min-[900px]:grid-cols-2">
          <SectionCard
            testId="corridors-panel"
            title="เส้นทางส่งต่อหลัก"
            description={`โรงพยาบาลต้นทาง → ปลายทางที่ส่งต่อสะสมมากที่สุด ${insights.corridors.length} อันดับ — ใช้ดูภาระของโรงพยาบาลแม่ข่าย`}
          >
            <ul className="flex flex-col gap-2">
              {insights.corridors.map((c) => (
                <li key={`${c.fromHospitalId}-${c.toHospitalId}`} className="flex items-center gap-3">
                  <span className="w-[45%] min-w-0 text-label text-ink-muted">
                    {c.fromHospital} → <b className="font-semibold text-ink">{c.toHospital}</b>
                  </span>
                  <span className="h-2.5 flex-1 rounded-full bg-surface-muted">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(4, (c.count / corridorMax) * 100)}%` }}
                    />
                  </span>
                  <span className="w-10 text-right text-label font-semibold tabular-nums text-ink">{c.count}</span>
                </li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard
            testId="daily-volume"
            title="ปริมาณส่งต่อ 7 วันล่าสุด"
            description="จำนวนเคสที่เริ่มส่งต่อในแต่ละวัน (เวลาไทย)"
          >
            <div className="flex h-28 items-end gap-2" role="img" aria-label="จำนวนส่งต่อรายวัน 7 วันล่าสุด">
              {insights.daily.map((d) => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                  <span className="text-caption tabular-nums text-ink-muted">{d.count > 0 ? d.count : ''}</span>
                  <span
                    className={d.count > 0 ? 'w-full rounded-t bg-brand' : 'w-full rounded-t bg-surface-muted'}
                    style={{ height: `${Math.max(2, (d.count / dailyMax) * 56)}px` }}
                  />
                  <span className="text-caption tabular-nums text-ink-muted">
                    {d.date.slice(8, 10)}/{d.date.slice(5, 7)}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      <SectionCard
        title="รายการส่งต่อ"
        actions={
          <span className="text-label text-ink-muted">
            หน้า {pagination.page}/{pagination.totalPages} · ทั้งหมด {pagination.total.toLocaleString('en-US')} รายการ
          </span>
        }
      >
        <FilterBar active={hasActiveFilters} onClear={clearFilters}>
          <SearchField label="ค้นหา" value={search.search} onChange={search.setSearch} placeholder="เลขที่ส่งต่อ / HN / ชื่อผู้ป่วย" />
          <FilterChips
            label="สถานะ (ทั้งจังหวัด)"
            value={statusFilter}
            onChange={(v) => toggle(setStatusFilter, v)}
            options={STATUSES.map((k) => ({
              value: k,
              label: STATUS_META[k].label,
              count: statusCounts[STATUS_COUNT_FIELD[k]],
              testId: `status-${k}`,
              hint: STATUS_TIPS[k],
            }))}
          />
          <FilterChips
            label="ความเร่งด่วน"
            value={urgencyFilter}
            onChange={(v) => {
              setUrgencyFilter(v);
              setPage(1);
            }}
            options={URGENCY_OPTIONS}
          />
          <FilterChips
            label="ช่วงเวลา"
            value={rangeFilter}
            onChange={(v) => {
              setRangeFilter(v);
              setPage(1);
            }}
            options={RANGE_OPTIONS}
          />
          <FilterSelect
            label="ส่งต่อไปยัง"
            testId="filter-to-hospital"
            value={toHospitalFilter}
            onChange={(v) => {
              setToHospitalFilter(v);
              setPage(1);
            }}
            options={[
              { value: '', label: 'ทุกโรงพยาบาล' },
              ...(insights?.destinations ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.count})` })),
            ]}
          />
        </FilterBar>
        <div className="mt-4">
          <ResponsiveTable<ProvincialReferralListItem>
            caption="รายการส่งต่อ"
            cardListLabel="รายการส่งต่อ"
            columns={COLUMNS}
            rows={referrals}
            rowKey={(r) => r.id}
            rowAttrs={(r) => ({
              'data-testid': `referral-row-${r.id}`,
              'data-urgency': r.urgencyLevel,
              'data-age': classifyReferralAge(r.initiatedAt, r.status),
            })}
            onRowClick={(r) => setSelectedReferralId(r.id)}
            rowLabel={(r) => `เปิดรายละเอียดการส่งต่อ ${r.referNumber ?? ''} ${maskName(r.patientName)}`.trim()}
            renderCard={(r) => <ReferralCard referral={r} onSelect={() => setSelectedReferralId(r.id)} />}
            empty={
              <EmptyState
                illustration="referral"
                title="ไม่พบรายการส่งต่อ"
                description={
                  hasActiveFilters
                    ? 'ไม่มีรายการที่ตรงกับตัวกรอง — กด ล้างตัวกรอง เพื่อดูทั้งหมด'
                    : 'ยังไม่มีการส่งต่อระหว่างโรงพยาบาลในระบบ — รายการจะปรากฏเมื่อโรงพยาบาลบันทึกการส่งต่อใน HOSxP'
                }
                action={
                  hasActiveFilters ? (
                    <ClearFiltersButton onClick={clearFilters} />
                  ) : undefined
                }
              />
            }
          />
        </div>
        <Pagination pagination={pagination} unit="รายการ" onPageChange={setPage} />
      </SectionCard>

      <ReferralDetailDialog referralId={selectedReferralId} onClose={() => setSelectedReferralId(null)} />
    </ListPageLayout>
  );
}

// useSearchParams (dashboard deep links) needs a Suspense boundary.
export default function ReferralsPage() {
  return (
    <Suspense fallback={<LoadingState message="กำลังโหลด..." />}>
      <ReferralsBoard />
    </Suspense>
  );
}
