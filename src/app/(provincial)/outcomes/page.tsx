// Outcomes — neonatal board on the shared list-page pattern (UI sub-project
// 4): range + hospital filters, six Thai KPI tiles, six-month trend,
// per-hospital table and a responsive recent-births list. LBW / low-Apgar
// rules come from NEWBORN_THRESHOLDS (same source as services/newborn.ts).
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { EmptyState } from '@/components/shared/EmptyState';
import { FlagChip } from '@/components/shared/FlagChip';
import { FilterBar, FilterChips, FilterSelect } from '@/components/shared/FilterBar';
import { DataTable, type DataTableColumn } from '@/components/shared/DataTable';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { useListData } from '@/hooks/useListData';
import { formatThaiDate, formatThaiTime } from '@/lib/utils';
import { maskName } from '@/lib/pii-mask';
import { NEWBORN_THRESHOLDS } from '@/config/newborn';
import { LIST_PAGE } from '@/config/list-page';
import { cn } from '@/lib/utils';
import type { OutcomeHospitalRow, OutcomesResponse, RecentBirthEntry } from '@/types/api';

const RANGE_OPTIONS = [
  { value: 'mtd', label: 'เดือนนี้' },
  { value: '30d', label: '30 วัน' },
  { value: 'all', label: 'ทั้งหมด' },
];

const isLbw = (b: RecentBirthEntry) => b.birthWeightG != null && b.birthWeightG < NEWBORN_THRESHOLDS.lbwGrams;
const isLowApgar = (b: RecentBirthEntry) => b.apgar5min != null && b.apgar5min < NEWBORN_THRESHOLDS.apgarLowAt5min;
const pct = (part: number, whole: number) => (whole > 0 ? ((part / whole) * 100).toFixed(1) : '0.0');

const HOSPITAL_COLUMNS: DataTableColumn<OutcomeHospitalRow>[] = [
  { key: 'name', header: 'โรงพยาบาล', cell: (h) => h.name },
  { key: 'births', header: 'เกิด', numeric: true, cell: (h) => h.births.toLocaleString('en-US') },
  {
    key: 'lbw',
    header: 'LBW (ร้อยละ)',
    numeric: true,
    cell: (h) => (
      <span className={h.lbw > 0 ? 'text-warn-text' : 'text-ink-muted'}>
        {h.lbw} ({pct(h.lbw, h.births)}%)
      </span>
    ),
  },
  {
    key: 'apgar',
    header: `Apgar 5 นาที < ${NEWBORN_THRESHOLDS.apgarLowAt5min}`,
    numeric: true,
    cell: (h) => <span className={h.lowApgar > 0 ? 'text-danger-text' : 'text-ink-muted'}>{h.lowApgar}</span>,
  },
];

function MotherCell({ birth: b, asLink }: { birth: RecentBirthEntry; asLink: boolean }) {
  const name = maskName(b.motherName);
  return asLink ? (
    <Link href={`/pregnancies/${b.journeyId}`} tabIndex={-1} className="text-body font-semibold text-ink hover:underline">
      {name}
    </Link>
  ) : (
    <span className="text-body font-semibold text-ink">{name}</span>
  );
}

function WeightCell({ birth: b }: { birth: RecentBirthEntry }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 tabular-nums">
      {b.birthWeightG != null ? `${b.birthWeightG.toLocaleString('en-US')} ก.` : '—'}
      {isLbw(b) && <FlagChip tone="warn">LBW</FlagChip>}
    </span>
  );
}

function ApgarCell({ birth: b }: { birth: RecentBirthEntry }) {
  return (
    <span className={cn('tabular-nums', isLowApgar(b) ? 'font-semibold text-danger-text' : 'text-ink')}>
      {b.apgar1min ?? '—'} / {b.apgar5min ?? '—'}
    </span>
  );
}

const BIRTH_COLUMNS: DataTableColumn<RecentBirthEntry>[] = [
  { key: 'mother', header: 'มารดา', className: 'min-w-[160px]', cell: (b) => <MotherCell birth={b} asLink /> },
  { key: 'infant', header: 'ทารก', cell: (b) => `คนที่ ${b.infantNumber} · ${b.sex ?? '—'}` },
  { key: 'weight', header: 'น้ำหนัก', cell: (b) => <WeightCell birth={b} /> },
  { key: 'apgar', header: 'Apgar 1 / 5 นาที', cell: (b) => <ApgarCell birth={b} /> },
  {
    key: 'resus',
    header: 'กู้ชีพ',
    cell: (b) => (b.resuscitated ? <FlagChip tone="warn">กู้ชีพ</FlagChip> : <span className="text-ink-muted">—</span>),
  },
  {
    key: 'born',
    header: 'เกิดเมื่อ',
    cell: (b) => (
      <span className="tabular-nums">
        {formatThaiDate(b.bornAt)} {formatThaiTime(b.bornAt)}
      </span>
    ),
  },
  { key: 'hospital', header: 'โรงพยาบาล', className: 'min-w-[120px]', cell: (b) => b.hospitalName },
];

function BirthCard({ birth: b }: { birth: RecentBirthEntry }) {
  return (
    <Link
      href={`/pregnancies/${b.journeyId}`}
      data-testid={`birth-card-${b.id}`}
      className="block rounded-xl border border-border px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <MotherCell birth={b} asLink={false} />
        {b.resuscitated && <FlagChip tone="warn">กู้ชีพ</FlagChip>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
        <span>คนที่ {b.infantNumber} · {b.sex ?? '—'}</span>
        <WeightCell birth={b} />
        <span>
          Apgar <ApgarCell birth={b} />
        </span>
      </div>
      <div className="mt-1 text-caption text-ink-muted">
        {formatThaiDate(b.bornAt)} {formatThaiTime(b.bornAt)} · {b.hospitalName}
      </div>
    </Link>
  );
}

const EMPTY: OutcomesResponse = {
  totalBirths: 0,
  lbwCount: 0,
  lbwRate: 0,
  lowApgarCount: 0,
  lowApgarRate: 0,
  avgBirthWeightG: 0,
  multiples: 0,
  resuscitated: 0,
  trend: [],
  byHospital: [],
  recent: [],
} as OutcomesResponse;

export default function OutcomesPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'ผลลัพธ์ทารก' }]);
  const router = useRouter();
  const [range, setRange] = useState('mtd');
  const [hospitalFilter, setHospitalFilter] = useState('');

  const queryParams = useMemo(() => {
    const p = new URLSearchParams({ range });
    if (hospitalFilter) p.set('hospital_id', hospitalFilter);
    return p.toString();
  }, [range, hospitalFilter]);

  const { data, isLoading, error, mutate, lastUpdatedAt } = useListData<OutcomesResponse>(
    `/api/dashboard/outcomes?${queryParams}`,
    LIST_PAGE.slowRefreshMs,
  );

  if (isLoading && !data) return <LoadingState message="กำลังโหลดข้อมูลผลลัพธ์ทารก..." />;
  if (error && !data) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดข้อมูลผลลัพธ์ทารกได้"
        detail={error instanceof Error ? error.message : String(error)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={() => mutate()}
      />
    );
  }

  const k = data ?? EMPTY;
  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === range)?.label ?? range;
  const noDataYet = k.totalBirths === 0 && k.recent.length === 0;
  const maxTrend = Math.max(...k.trend.map((t) => t.births), 1);

  return (
    <ListPageLayout
      title="ผลลัพธ์ทารก"
      subtitle={`ตัวชี้วัดทารกแรกเกิดทั้งจังหวัด · ช่วง${rangeLabel}`}
      updatedAt={lastUpdatedAt}
      stale={
        error
          ? {
              message: 'การเชื่อมต่อล้มเหลว — แสดงข้อมูลผลลัพธ์ทารกเดิมจากแคช',
              onRetry: () => void mutate(),
              refreshSeconds: LIST_PAGE.slowRefreshMs / 1000,
            }
          : null
      }
    >
      <FilterBar active={hospitalFilter !== ''} onClear={() => setHospitalFilter('')}>
        <FilterChips label="ช่วงเวลา" value={range} onChange={setRange} options={RANGE_OPTIONS} />
        <FilterSelect
          label="โรงพยาบาล"
          testId="filter-hospital"
          value={hospitalFilter}
          onChange={setHospitalFilter}
          options={[
            { value: '', label: 'ทุกโรงพยาบาล' },
            ...k.byHospital.map((h) => ({ value: h.id, label: `${h.name} (${h.births})` })),
          ]}
        />
      </FilterBar>

      {noDataYet && (
        <EmptyState
          illustration="stale"
          tone="warn"
          title="ยังไม่มีข้อมูลทารกจากการซิงค์ HOSxP ในช่วงที่เลือก"
          description="ระบบจะเติมข้อมูลย้อนหลังอัตโนมัติเมื่อรอบซิงค์ถัดไปทำงาน — ลองเลือกช่วง ทั้งหมด หรือกลับมาดูภายหลัง"
        />
      )}

      <SectionCard title="ตัวชี้วัดทารกแรกเกิด" description={`ช่วง${rangeLabel} · ครรภ์แฝดนับแยกรายทารก`}>
        <KpiGrid count={6}>
          <KpiTile
            testId="kpi-total"
            label="ทารกเกิดทั้งหมด"
            count={k.totalBirths}
            sub={`ราย · ${rangeLabel}`}
            hint={{
              title: 'ทารกเกิดทั้งหมดในช่วงที่เลือก',
              body: 'นับจากบันทึกทารกแรกเกิด (labour_infant) ที่ซิงค์จาก HOSxP ตามวันเวลาเกิด — ครรภ์แฝดนับแยกรายทารก เปลี่ยนช่วงได้ที่ตัวกรองช่วงเวลา',
            }}
          />
          <KpiTile
            testId="kpi-lbw"
            label={`น้ำหนักแรกเกิดน้อย (LBW < ${NEWBORN_THRESHOLDS.lbwGrams.toLocaleString('en-US')} ก.)`}
            count={k.lbwCount}
            tone={k.lbwCount > 0 ? 'warn' : 'default'}
            sub={`${k.lbwRate.toFixed(1)}% ของทารกทั้งหมด`}
            hint={{
              title: 'ทารกน้ำหนักแรกเกิดน้อย (LBW)',
              body: `น้ำหนักแรกเกิดต่ำกว่า ${NEWBORN_THRESHOLDS.lbwGrams.toLocaleString('en-US')} กรัม — ตัวชี้วัดอนามัยแม่และเด็กหลักของ สธ. ร้อยละคิดจากทารกทั้งหมดในช่วงเดียวกัน`,
            }}
          />
          <KpiTile
            testId="kpi-apgar"
            label={`Apgar 5 นาที < ${NEWBORN_THRESHOLDS.apgarLowAt5min}`}
            count={k.lowApgarCount}
            tone={k.lowApgarCount > 0 ? 'warn' : 'default'}
            sub={`${k.lowApgarRate.toFixed(1)}% ของทารกทั้งหมด`}
            hint={{
              title: `Apgar ที่ 5 นาที ต่ำกว่า ${NEWBORN_THRESHOLDS.apgarLowAt5min}`,
              body: 'ใช้คะแนน Apgar นาทีที่ 5 (ตัวทำนายผลลัพธ์มาตรฐาน ไม่ใช่นาทีที่ 1) — ทารกกลุ่มนี้ควรได้รับการติดตามภาวะแทรกซ้อน',
            }}
          />
          <KpiTile
            testId="kpi-resus"
            label="ได้รับการกู้ชีพ"
            count={k.resuscitated}
            tone={k.resuscitated > 0 ? 'warn' : 'default'}
            sub="PPV / ใส่ท่อ / กดหน้าอก / ออกซิเจน"
            hint={{
              title: 'ทารกที่ได้รับการกู้ชีพแรกเกิด',
              body: 'มีการช่วยเหลืออย่างน้อยหนึ่งอย่าง: PPV / ใส่ท่อช่วยหายใจ / กดหน้าอก / ออกซิเจน / Narcan — จากแบบบันทึกห้องคลอด HOSxP',
            }}
          />
          <KpiTile
            testId="kpi-multiples"
            label="ทารกจากครรภ์แฝด"
            count={k.multiples}
            sub="ทารกคนที่ 2 ขึ้นไป"
            hint={{
              title: 'ทารกจากครรภ์แฝด',
              body: 'ทารกลำดับที่ 2 ขึ้นไปของการคลอดเดียวกัน — ครรภ์แฝดเป็นกลุ่มเสี่ยงที่ต้องวางแผนคลอดล่วงหน้า',
            }}
          />
          <KpiTile
            testId="kpi-avg-weight"
            label="น้ำหนักแรกเกิดเฉลี่ย"
            count={k.avgBirthWeightG > 0 ? k.avgBirthWeightG : null}
            unit="กรัม"
            hint={{
              title: 'น้ำหนักแรกเกิดเฉลี่ย',
              body: 'ค่าเฉลี่ยน้ำหนักแรกเกิด (กรัม) ของทารกทุกคนในช่วงที่เลือก — ใช้ดูแนวโน้มโภชนาการมารดาในภาพรวม',
            }}
          />
        </KpiGrid>
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 @min-[900px]:grid-cols-2">
        <SectionCard
          testId="outcome-trend"
          title="จำนวนเกิดรายเดือน (6 เดือนล่าสุด)"
          description="ไม่ขึ้นกับช่วงเวลาที่เลือก แต่กรองตามโรงพยาบาลได้ · ตัวเลขใต้แท่ง = LBW"
        >
          <div className="flex h-32 items-end gap-2" role="img" aria-label="จำนวนเกิดรายเดือน 6 เดือนล่าสุด">
            {k.trend.map((t) => (
              <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-caption tabular-nums text-ink-muted">{t.births > 0 ? t.births : ''}</span>
                <span
                  className={t.births > 0 ? 'w-full rounded-t bg-brand' : 'w-full rounded-t bg-surface-muted'}
                  style={{ height: `${Math.max(2, (t.births / maxTrend) * 56)}px` }}
                />
                <span className="text-caption tabular-nums text-ink-muted">
                  {t.month.slice(5)}/{t.month.slice(2, 4)}
                </span>
                <span className={cn('text-caption tabular-nums', t.lbw > 0 ? 'text-warn-text' : 'text-ink-muted')}>
                  {t.lbw > 0 ? `LBW ${t.lbw}` : '·'}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
        <SectionCard
          testId="hospital-outcomes"
          title={`ผลลัพธ์รายโรงพยาบาล · ${rangeLabel}`}
          description="เรียงจากโรงพยาบาลที่มีการเกิดมากที่สุด"
        >
          <DataTable<OutcomeHospitalRow>
            caption="ผลลัพธ์รายโรงพยาบาล"
            columns={HOSPITAL_COLUMNS}
            rows={k.byHospital}
            rowKey={(h) => h.hcode}
            rowAttrs={(h) => ({ 'data-testid': `hospital-outcome-${h.hcode}` })}
            empty={<EmptyState title="ไม่มีข้อมูลในช่วงที่เลือก" description="ลองเปลี่ยนช่วงเวลาหรือโรงพยาบาล" />}
          />
        </SectionCard>
      </div>

      <SectionCard
        title="การเกิดล่าสุด"
        actions={
          <span className="text-label text-ink-muted">
            ล่าสุด {k.recent.length} จาก {k.totalBirths.toLocaleString('en-US')} ราย · {rangeLabel}
          </span>
        }
      >
        <ResponsiveTable<RecentBirthEntry>
          caption="การเกิดล่าสุด"
          cardListLabel="การเกิดล่าสุด"
          columns={BIRTH_COLUMNS}
          rows={k.recent}
          rowKey={(b) => b.id}
          rowAttrs={(b) => ({ 'data-testid': `birth-row-${b.id}`, 'data-low-apgar': isLowApgar(b) ? 'true' : 'false' })}
          onRowClick={(b) => router.push(`/pregnancies/${b.journeyId}`)}
          rowLabel={(b) => `เปิดข้อมูลการตั้งครรภ์ของ ${maskName(b.motherName)}`}
          renderCard={(b) => <BirthCard birth={b} />}
          empty={<EmptyState title="ไม่มีการเกิดในช่วงที่เลือก" description="ลองเปลี่ยนช่วงเวลาหรือโรงพยาบาล" />}
        />
      </SectionCard>
    </ListPageLayout>
  );
}
