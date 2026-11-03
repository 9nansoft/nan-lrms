// Pregnancies — provincial ANC board on the shared list-page pattern (UI
// sub-project 4). Risk and ops-cohort KPI tiles (DB-wide counts, click to
// filter), a responsive registry (table when wide, cards when narrow), Thai
// labels with thresholds from config. Data wiring unchanged: /api/journeys,
// 30s refresh, debounced SSE refresh, server-side search.
'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { useSSE } from '@/hooks/useSSE';
import { useListData } from '@/hooks/useListData';
import { useDebouncedSearch } from '@/hooks/useDebouncedSearch';
import { debounceLeadingTrailing, SSE_REFRESH_DEBOUNCE_MS } from '@/lib/debounce';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { EmptyState } from '@/components/shared/EmptyState';
import { FlagChip } from '@/components/shared/FlagChip';
import { AncRiskChip } from '@/components/shared/AncRiskChip';
import { ClearFiltersButton, FilterBar, FilterSelect, SearchField } from '@/components/shared/FilterBar';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { Pagination } from '@/components/shared/Pagination';
import type { DataTableColumn } from '@/components/shared/DataTable';
import { RiskBar } from '@/components/dashboard/shared';
import { formatThaiDate, formatRelativeTime } from '@/lib/utils';
import { maskName } from '@/lib/pii-mask';
import { ANC_RISK_LABEL_TH } from '@/config/anc-risk-display';
import { ANC_OPS, classifyAncFollowup, classifyEdcDue, type AncFollowupClass, type EdcDueClass } from '@/config/anc-ops';
import {
  ANC_EDC_MAX_PAST_DAYS,
  ANC_LAST_VISIT_MAX_AGE_DAYS,
  ANC_MAX_GA_WEEKS,
  ANC_REGISTRY_CRITERIA_TH,
} from '@/config/anc-freshness';
import { LIST_PAGE } from '@/config/list-page';
import type { JourneyListItem, JourneyListResponse } from '@/types/api';

type AncRisk = 'LOW' | 'HR1' | 'HR2' | 'HR3';
const RISKS: AncRisk[] = ['LOW', 'HR1', 'HR2', 'HR3'];
const DAY_MS = 24 * 3600_000;

// Day-count helpers outside components (react-hooks/purity).
function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / DAY_MS);
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS);
}
function ageFlag(age: number): 'teen' | 'ama' | undefined {
  if (age < ANC_OPS.teenAgeUnder) return 'teen';
  if (age >= ANC_OPS.advancedMaternalAgeMin) return 'ama';
  return undefined;
}

function DueCell({ edc, due }: { edc: string | null; due: EdcDueClass }) {
  if (!edc) return <span className="text-ink-muted">—</span>;
  const delta = daysUntil(edc);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-label tabular-nums text-ink">{formatThaiDate(edc)}</span>
      {due === 'overdue' ? (
        <FlagChip tone="danger">เกินกำหนด {Math.abs(delta)} วัน</FlagChip>
      ) : due === 'dueSoon' ? (
        <FlagChip tone="warn">ครบกำหนดใน {Math.max(delta, 0)} วัน</FlagChip>
      ) : (
        <span className="text-caption text-ink-muted">อีก {delta} วัน</span>
      )}
    </div>
  );
}

function LastAncCell({ lastAncDate, followup }: { lastAncDate: string | null; followup: AncFollowupClass }) {
  if (!lastAncDate) return <span className="text-ink-muted">—</span>;
  const since = daysSince(lastAncDate);
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-label tabular-nums text-ink">{formatThaiDate(lastAncDate)}</span>
      {followup === 'critical' ? (
        <FlagChip tone="danger">ใกล้หลุดติดตาม · {since} วัน</FlagChip>
      ) : followup === 'warn' ? (
        <FlagChip tone="warn">ห่างนัด {since} วัน</FlagChip>
      ) : (
        <span className="text-caption text-ink-muted">{formatRelativeTime(lastAncDate)}</span>
      )}
    </div>
  );
}

function PatientCell({ journey: j, asLink }: { journey: JourneyListItem; asLink: boolean }) {
  const flag = ageFlag(j.age);
  const name = maskName(j.name);
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {asLink ? (
        <Link href={`/pregnancies/${j.id}`} tabIndex={-1} className="text-body font-semibold text-ink hover:underline">
          {name}
        </Link>
      ) : (
        <span className="text-body font-semibold text-ink">{name}</span>
      )}
      <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption text-ink-muted">
        <span className="tabular-nums">HN {j.hn}</span>
        <span>· อายุ {j.age} ปี</span>
        {flag === 'teen' && <FlagChip tone="warn">อายุ &lt; {ANC_OPS.teenAgeUnder}</FlagChip>}
        {flag === 'ama' && <FlagChip tone="neutral">อายุ {ANC_OPS.advancedMaternalAgeMin}+</FlagChip>}
        <span className="tabular-nums">
          · G{j.gravida}
          {j.para > 0 && <>P{j.para}</>}
        </span>
      </span>
    </div>
  );
}

const COLUMNS: DataTableColumn<JourneyListItem>[] = [
  { key: 'patient', header: 'ผู้ป่วย', className: 'min-w-[200px]', cell: (j) => <PatientCell journey={j} asLink /> },
  { key: 'risk', header: 'ความเสี่ยง', cell: (j) => <AncRiskChip level={j.ancRiskLevel} /> },
  { key: 'ga', header: 'GA', numeric: true, cell: (j) => (j.gaWeeks != null ? `${j.gaWeeks} สัปดาห์` : '—') },
  { key: 'anc', header: 'ANC', numeric: true, cell: (j) => `${j.ancVisitCount} ครั้ง` },
  {
    key: 'last',
    header: 'ANC ล่าสุด',
    cell: (j) => <LastAncCell lastAncDate={j.lastAncDate} followup={classifyAncFollowup(j.lastAncDate)} />,
  },
  { key: 'due', header: 'กำหนดคลอด (EDC)', cell: (j) => <DueCell edc={j.edc} due={classifyEdcDue(j.edc)} /> },
  { key: 'hospital', header: 'โรงพยาบาล', className: 'min-w-[120px]', cell: (j) => j.hospitalName },
];

function JourneyCard({ journey: j }: { journey: JourneyListItem }) {
  return (
    <Link
      href={`/pregnancies/${j.id}`}
      data-testid={`journey-card-${j.id}`}
      className="block rounded-xl border border-border px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex items-start justify-between gap-2">
        <PatientCell journey={j} asLink={false} />
        <AncRiskChip level={j.ancRiskLevel} />
      </div>
      <div className="mt-1 text-label text-ink-muted">
        {j.gaWeeks != null && <>GA {j.gaWeeks} สัปดาห์ · </>}ANC {j.ancVisitCount} ครั้ง · {j.hospitalName}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-ink-muted">ANC ล่าสุด</span>
          <LastAncCell lastAncDate={j.lastAncDate} followup={classifyAncFollowup(j.lastAncDate)} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-caption text-ink-muted">กำหนดคลอด (EDC)</span>
          <DueCell edc={j.edc} due={classifyEdcDue(j.edc)} />
        </div>
      </div>
    </Link>
  );
}

// Hint copy mirrors journey-list.ts SQL and config thresholds so it cannot drift.
const RISK_TIPS: Record<AncRisk, string> = {
  LOW: 'หญิงตั้งครรภ์ที่ผลคัดกรองความเสี่ยง ANC อยู่ระดับปกติ ติดตามตามนัดมาตรฐาน กดการ์ดเพื่อกรองรายชื่อ',
  HR1: 'ความเสี่ยงระดับ 1 จากแบบคัดกรอง ANC ของ HOSxP — ติดตามใกล้ชิดขึ้น กดการ์ดเพื่อกรองรายชื่อ',
  HR2: 'ความเสี่ยงระดับ 2 — ควรพบแพทย์ตามแนวทางครรภ์เสี่ยง กดการ์ดเพื่อกรองรายชื่อ',
  HR3: 'ความเสี่ยงสูงสุด — ควรฝากครรภ์และคลอดในโรงพยาบาลที่มีศักยภาพ กดการ์ดเพื่อกรองรายชื่อ',
};

const SORT_OPTIONS = [
  { value: 'due', label: 'ใกล้กำหนดคลอด' },
  { value: 'ga', label: 'GA มาก → น้อย' },
  { value: 'last_anc', label: 'ขาดนัดนานสุด' },
  { value: 'newest', label: 'ลงทะเบียนล่าสุด' },
];

interface CohortDef {
  testId: string;
  cohort: string;
  label: string;
  value: (o: NonNullable<JourneyListResponse['opsCounts']>) => number;
  warnWhenPositive?: boolean;
  hint: { title: string; body: string };
}

const COHORTS: CohortDef[] = [
  {
    testId: 'kpi-due-soon',
    cohort: 'due_soon',
    label: `ครบกำหนดคลอดใน ${ANC_OPS.dueSoonDays} วัน`,
    value: (o) => o.dueSoon,
    hint: {
      title: `ครบกำหนดคลอดภายใน ${ANC_OPS.dueSoonDays} วัน`,
      body: `EDC อยู่ภายใน ${ANC_OPS.dueSoonDays} วันข้างหน้า (รวมที่เลยกำหนดแล้ว) — ภาระงานห้องคลอดที่กำลังมาถึง ใช้วางแผนเตียงและการส่งต่อ กดการ์ดเพื่อกรองรายชื่อ`,
    },
  },
  {
    testId: 'kpi-overdue-edc',
    cohort: 'overdue_edc',
    label: 'เลยกำหนดคลอด ยังไม่มีบันทึกคลอด',
    value: (o) => o.overdueEdc,
    warnWhenPositive: true,
    hint: {
      title: 'เลยกำหนดคลอดแล้วยังไม่คลอด',
      body: `EDC ผ่านมาแล้วแต่ยังไม่มีบันทึกคลอด (ระบบตัดออกจากทะเบียนอัตโนมัติเมื่อเกิน ${ANC_EDC_MAX_PAST_DAYS} วัน) — ควรตรวจสอบสถานะจริงกับโรงพยาบาล กดการ์ดเพื่อกรองรายชื่อ`,
    },
  },
  {
    testId: 'kpi-anc-stale',
    cohort: 'anc_stale',
    label: `ห่างนัด ANC เกิน ${ANC_OPS.followupWarnDays} วัน`,
    value: (o) => o.ancStale,
    hint: {
      title: `ห่างนัด ANC เกิน ${ANC_OPS.followupWarnDays} วัน`,
      body: `นัดล่าสุดผ่านมาเกิน ${ANC_OPS.followupWarnDays} วัน แต่ยังไม่ถึงเกณฑ์หลุดการติดตาม (${ANC_LAST_VISIT_MAX_AGE_DAYS} วัน) — ช่วงเวลาทองของการตามกลับมาตรวจ กดการ์ดเพื่อกรองรายชื่อ`,
    },
  },
  {
    testId: 'kpi-low-visits',
    cohort: 'low_visits',
    label: `ANC ไม่ถึง ${ANC_OPS.minVisits} ครั้ง (GA ≥ ${ANC_OPS.minVisitsGaWeeks} สัปดาห์)`,
    value: (o) => o.lowVisits,
    hint: {
      title: `ฝากครรภ์ไม่ครบเกณฑ์ ${ANC_OPS.minVisits} ครั้ง`,
      body: `อายุครรภ์ ≥ ${ANC_OPS.minVisitsGaWeeks} สัปดาห์แล้ว แต่จำนวนครั้ง ANC ยังน้อยกว่า ${ANC_OPS.minVisits} ครั้งตามเกณฑ์คุณภาพ ANC ของ สธ. กดการ์ดเพื่อกรองรายชื่อ`,
    },
  },
  {
    testId: 'kpi-near-term',
    cohort: 'near_term',
    label: `ใกล้คลอด GA ≥ ${ANC_OPS.nearTermGaWeeks} สัปดาห์`,
    value: (o) => o.nearTerm,
    hint: {
      title: `อายุครรภ์ ≥ ${ANC_OPS.nearTermGaWeeks} สัปดาห์`,
      body: `กลุ่มใกล้คลอด — ตัวเลขเดียวกับการ์ดใกล้คลอดของหน้าโรงพยาบาลแม่ข่าย ใช้เตรียมแผนรับคลอด กดการ์ดเพื่อกรองรายชื่อ`,
    },
  },
  {
    testId: 'kpi-ltfu',
    cohort: 'ltfu',
    label: `หลุดการติดตาม (${ANC_LAST_VISIT_MAX_AGE_DAYS}–${ANC_OPS.ltfuWindowDays} วัน)`,
    value: (o) => o.ltfu,
    warnWhenPositive: true,
    hint: {
      title: `หลุดการติดตาม (${ANC_LAST_VISIT_MAX_AGE_DAYS}–${ANC_OPS.ltfuWindowDays} วัน)`,
      body: `ขาดนัดเกิน ${ANC_LAST_VISIT_MAX_AGE_DAYS} วันจนถูกตัดออกจากทะเบียน แต่ยังไม่เกิน ${ANC_OPS.ltfuWindowDays} วัน — รายชื่อสำหรับตามกลับเข้าระบบก่อนปิดเคส กดการ์ดเพื่อเปิดรายชื่อ`,
    },
  },
];

function PregnanciesBoard() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ฝากครรภ์' }]);
  const router = useRouter();

  // Deep links from the dashboard land pre-filtered (?risk=HR3, ?cohort=anc_stale).
  const searchParams = useSearchParams();
  const riskParam = searchParams.get('risk');
  const [page, setPage] = useState(1);
  const [riskFilter, setRiskFilter] = useState<'' | AncRisk>(
    RISKS.includes(riskParam as AncRisk) ? (riskParam as AncRisk) : '',
  );
  const [cohortFilter, setCohortFilter] = useState(searchParams.get('cohort') ?? '');
  const [hospitalFilter, setHospitalFilter] = useState('');
  const [sortBy, setSortBy] = useState('due');
  const resetPage = useCallback(() => setPage(1), [setPage]);
  // Server search: HN prefix, decrypted name or hospital name (journey-list.ts).
  const search = useDebouncedSearch(resetPage);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({
      stage: 'PREGNANCY',
      page: String(page),
      per_page: String(LIST_PAGE.perPage),
      sort: sortBy,
    });
    if (riskFilter) p.set('risk_level', riskFilter);
    if (cohortFilter) p.set('cohort', cohortFilter);
    if (hospitalFilter) p.set('hospital_id', hospitalFilter);
    if (search.query) p.set('q', search.query);
    return p.toString();
  }, [page, sortBy, riskFilter, cohortFilter, hospitalFilter, search.query]);

  const { data, isLoading, error, mutate, lastUpdatedAt } = useListData<JourneyListResponse>(
    `/api/journeys?${queryParams}`,
    LIST_PAGE.refreshMs,
  );

  // Real-time refresh on webhook/sync activity, debounced (leading+trailing)
  // so continuous multi-hospital sync cannot turn every SSE event into a
  // refetch (2026-07-17 incident).
  const refresh = useMemo(() => debounceLeadingTrailing(() => void mutate(), SSE_REFRESH_DEBOUNCE_MS), [mutate]);
  useSSE({ onPatientUpdate: refresh, onSyncComplete: refresh });

  const journeys = useMemo(() => data?.journeys ?? [], [data?.journeys]);
  // DB-wide breakdowns — independent of pagination and filters; null renders "—".
  const counts = data?.counts ?? null;
  const opsCounts = data?.opsCounts ?? null;
  const hospitalCounts = data?.hospitalCounts ?? [];
  const hasActiveFilters = Boolean(riskFilter || cohortFilter || hospitalFilter || search.query);

  const clearFilters = () => {
    setRiskFilter('');
    setCohortFilter('');
    setHospitalFilter('');
    search.clear();
    setPage(1);
  };

  if (isLoading && !data) return <LoadingState message="กำลังโหลดข้อมูลฝากครรภ์..." />;
  if (error && !data) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดทะเบียนฝากครรภ์ได้"
        detail={error instanceof Error ? error.message : String(error)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={() => mutate()}
      />
    );
  }

  const pagination = data?.pagination ?? { total: 0, page: 1, perPage: LIST_PAGE.perPage, totalPages: 1 };
  const total = counts ? counts.total : pagination.total;

  return (
    <ListPageLayout
      title="ฝากครรภ์ (ANC)"
      subtitle={`ทะเบียนหญิงตั้งครรภ์ทั้งจังหวัด ${total.toLocaleString('en-US')} ราย · ไม่รวมรายที่คลอดแล้ว อายุครรภ์เกิน ${ANC_MAX_GA_WEEKS} สัปดาห์ หรือขาดการติดตามเกิน ${ANC_LAST_VISIT_MAX_AGE_DAYS} วัน (ดูรายที่หลุดการติดตามได้ที่การ์ด หลุดการติดตาม)`}
      updatedAt={lastUpdatedAt}
      stale={
        error
          ? {
              message: 'การเชื่อมต่อล้มเหลว — แสดงทะเบียนฝากครรภ์เดิมจากแคช',
              onRetry: () => void mutate(),
              refreshSeconds: LIST_PAGE.refreshMs / 1000,
            }
          : null
      }
    >
      <SectionCard
        title="ระดับความเสี่ยงทั้งจังหวัด"
        description="นับจากทะเบียนทั้งจังหวัด ไม่ขึ้นกับตัวกรอง — กดการ์ดเพื่อกรองรายชื่อ กดซ้ำเพื่อยกเลิก"
      >
        <KpiGrid count={1 + RISKS.length}>
          <KpiTile
            testId="kpi-anc-total"
            label="หญิงตั้งครรภ์ทั้งหมด"
            count={counts?.total}
            sub={
              <RiskBar
                low={counts?.low ?? 0}
                medium={counts ? counts.hr1 + counts.hr2 : 0}
                high={counts?.hr3 ?? 0}
                height={6}
              />
            }
          />
          {RISKS.map((k) => (
            <KpiTile
              key={k}
              testId={`risk-${k}`}
              label={k === 'LOW' ? ANC_RISK_LABEL_TH[k] : `${k} · ${ANC_RISK_LABEL_TH[k]}`}
              count={counts ? { LOW: counts.low, HR1: counts.hr1, HR2: counts.hr2, HR3: counts.hr3 }[k] : null}
              tone={k === 'HR3' ? 'warn' : 'default'}
              selected={riskFilter === k}
              onSelect={() => {
                setRiskFilter((r) => (r === k ? '' : k));
                setPage(1);
              }}
              hint={{ title: `${k} — ${ANC_RISK_LABEL_TH[k]}`, body: RISK_TIPS[k] }}
            />
          ))}
        </KpiGrid>
      </SectionCard>

      <SectionCard
        title="กลุ่มที่ต้องติดตาม"
        description="นับทั้งจังหวัด — กดการ์ดเพื่อกรองรายชื่อ กดซ้ำเพื่อยกเลิก"
      >
        <KpiGrid count={COHORTS.length}>
          {COHORTS.map((c) => {
            const v = opsCounts ? c.value(opsCounts) : null;
            return (
              <KpiTile
                key={c.cohort}
                testId={c.testId}
                label={c.label}
                count={v}
                tone={c.warnWhenPositive && (v ?? 0) > 0 ? 'warn' : 'default'}
                selected={cohortFilter === c.cohort}
                onSelect={() => {
                  setCohortFilter((cur) => (cur === c.cohort ? '' : c.cohort));
                  setPage(1);
                }}
                hint={c.hint}
              />
            );
          })}
        </KpiGrid>
      </SectionCard>

      <SectionCard
        title="รายชื่อหญิงตั้งครรภ์"
        description={ANC_REGISTRY_CRITERIA_TH}
        actions={<span className="text-label text-ink-muted">ทั้งหมด {pagination.total.toLocaleString('en-US')} ราย</span>}
      >
        <FilterBar active={hasActiveFilters} onClear={clearFilters}>
          <SearchField label="ค้นหา" value={search.search} onChange={search.setSearch} placeholder="ชื่อ / HN / โรงพยาบาล" />
          <FilterSelect
            label="โรงพยาบาล"
            testId="filter-hospital"
            value={hospitalFilter}
            onChange={(v) => {
              setHospitalFilter(v);
              setPage(1);
            }}
            options={[
              { value: '', label: 'ทุกโรงพยาบาล' },
              ...hospitalCounts.map((h) => ({ value: h.id, label: `${h.name} (${h.count})` })),
            ]}
          />
          <FilterSelect
            label="เรียงตาม"
            testId="sort-select"
            value={sortBy}
            onChange={(v) => {
              setSortBy(v);
              setPage(1);
            }}
            options={SORT_OPTIONS}
          />
        </FilterBar>
        <div className="mt-4">
          <ResponsiveTable<JourneyListItem>
            caption="รายชื่อหญิงตั้งครรภ์"
            cardListLabel="รายชื่อหญิงตั้งครรภ์"
            columns={COLUMNS}
            rows={journeys}
            rowKey={(j) => j.id}
            rowAttrs={(j) => ({
              'data-testid': `journey-row-${j.id}`,
              'data-due': classifyEdcDue(j.edc),
              'data-followup': classifyAncFollowup(j.lastAncDate),
              'data-age-flag': ageFlag(j.age),
            })}
            onRowClick={(j) => router.push(`/pregnancies/${j.id}`)}
            rowLabel={(j) => `เปิดข้อมูลการตั้งครรภ์ ${maskName(j.name)} HN ${j.hn}`}
            renderCard={(j) => <JourneyCard journey={j} />}
            empty={
              <EmptyState
                title="ไม่พบข้อมูลฝากครรภ์"
                description={
                  hasActiveFilters
                    ? 'ไม่มีรายที่ตรงกับตัวกรอง — กด ล้างตัวกรอง เพื่อดูทั้งหมด'
                    : 'ยังไม่มีข้อมูลฝากครรภ์ในทะเบียน — ข้อมูลจะปรากฏเมื่อโรงพยาบาลซิงค์จาก HOSxP'
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
        <Pagination pagination={pagination} unit="ราย" onPageChange={setPage} />
      </SectionCard>
    </ListPageLayout>
  );
}

// useSearchParams (dashboard deep links) needs a Suspense boundary in
// prerendered app-router pages.
export default function PregnanciesPage() {
  return (
    <Suspense fallback={<LoadingState message="กำลังโหลด..." />}>
      <PregnanciesBoard />
    </Suspense>
  );
}
