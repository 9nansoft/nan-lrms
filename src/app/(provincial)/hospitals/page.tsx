// Hospitals — provincial directory on the shared list-page pattern (UI
// sub-project 4): area toggle, KPI tiles summed from per-hospital server
// aggregates, a map + level-grouped roster that select in sync. Roll-ups:
// services/hospital-roster.ts. Status words: config/hospital-status.ts.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NETWORK_RETRY_REMEDY } from '@/lib/actionable-errors';
import { useDashboard } from '@/hooks/useDashboard';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { LoadingState } from '@/components/shared/LoadingState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { EmptyState } from '@/components/shared/EmptyState';
import { FlagChip } from '@/components/shared/FlagChip';
import { FilterChips, SearchField } from '@/components/shared/FilterBar';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import type { DataTableColumn } from '@/components/shared/DataTable';
import { RiskBar } from '@/components/dashboard/shared';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { ANC_REGISTRY_CRITERIA_TH, ANC_REGISTRY_LABEL_TH } from '@/config/anc-freshness';
import {
  classifyPartographCoverage,
  classifySyncHealth,
  PARTOGRAPH_QUALITY,
  SYNC_HEALTH,
  type PartographCoverageClass,
  type SyncHealthClass,
} from '@/config/hospital-network';
import { HOSPITAL_LINK_STATUS, SYNC_HEALTH_TH } from '@/config/hospital-status';
import { LIST_PAGE } from '@/config/list-page';
import {
  groupRosterByLevel,
  rosterArea,
  searchRoster,
  summarizeRoster,
  type RosterArea,
} from '@/services/hospital-roster';
import { formatRelativeAge } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import type { DashboardHospital } from '@/types/api';

const SYNC_DOT: Record<SyncHealthClass, string> = {
  ok: 'bg-ok',
  stale: 'bg-warn',
  critical: 'bg-danger',
  never: 'bg-ink-subtle',
  blocked: 'bg-danger',
};
const SYNC_TEXT: Record<SyncHealthClass, string> = {
  ok: 'text-ink-muted',
  stale: 'text-warn-text',
  critical: 'text-danger-text',
  never: 'text-ink-muted',
  blocked: 'text-danger-text',
};
const PARTO_TEXT: Record<PartographCoverageClass, string> = {
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  critical: 'text-danger-text',
  none: 'text-ink-muted',
};

/** Relative last-sync age with a status dot; blocked / never get their words. */
function SyncCell({ hospital }: { hospital: DashboardHospital }) {
  const health = classifySyncHealth(hospital.syncStatus, hospital.lastSyncAt);
  const text =
    health === 'blocked' || health === 'never'
      ? SYNC_HEALTH_TH[health]
      : formatRelativeAge(hospital.lastSyncAt, 'th');
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-label tabular-nums', SYNC_TEXT[health])}
      title={hospital.syncBlockedReason ?? SYNC_HEALTH_TH[health]}
    >
      <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', SYNC_DOT[health])} />
      {text}
    </span>
  );
}

/** Partograph coverage "charted/recent" over the quality window; "—" when no
 *  recent admissions. */
function PartoCell({ hospital }: { hospital: DashboardHospital }) {
  const pq = hospital.partographQuality;
  const cls = classifyPartographCoverage(pq.laborRecent, pq.withPartograph);
  return (
    <span
      data-testid="parto-cell"
      data-parto={cls}
      className={cn('text-label font-semibold tabular-nums', PARTO_TEXT[cls])}
      title={
        cls === 'none'
          ? `ไม่มีผู้คลอดรับใหม่ใน ${PARTOGRAPH_QUALITY.windowDays} วัน`
          : `บันทึกพาร์โทกราฟ ${pq.withPartograph} จาก ${pq.laborRecent} ราย (${PARTOGRAPH_QUALITY.windowDays} วัน)`
      }
    >
      {cls === 'none' ? '—' : `${pq.withPartograph}/${pq.laborRecent}`}
    </span>
  );
}

function HospitalName({ hospital: h, asLink }: { hospital: DashboardHospital; asLink: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        {asLink ? (
          // tabIndex -1: the row is the keyboard target; the link keeps
          // middle-click / open-in-new-tab (spec L2).
          <Link
            href={`/hospitals/${h.hcode}`}
            tabIndex={-1}
            className="text-body font-semibold text-ink hover:underline"
          >
            {h.name}
          </Link>
        ) : (
          <span className="text-body font-semibold text-ink">{h.name}</span>
        )}
        {h.counts.high > 0 && <FlagChip tone="danger">เสี่ยงสูง {h.counts.high}</FlagChip>}
        {h.ancCounts.hr3 > 0 && (
          <FlagChip tone="warn" title={`ครรภ์เสี่ยงสูง (HR3) ${h.ancCounts.hr3} ราย`}>
            HR3 {h.ancCounts.hr3}
          </FlagChip>
        )}
      </span>
      <span className="text-caption tabular-nums text-ink-muted">รหัส {h.hcode}</span>
    </div>
  );
}

const dash = (n: number) => (n > 0 ? n.toLocaleString('en-US') : '—');

const ROSTER_COLUMNS: DataTableColumn<DashboardHospital>[] = [
  {
    key: 'name',
    header: 'โรงพยาบาล',
    className: 'min-w-[160px]',
    cell: (h) => <HospitalName hospital={h} asLink />,
  },
  { key: 'anc', header: 'ANC', numeric: true, cell: (h) => dash(h.ancCounts.total) },
  { key: 'labor', header: 'ห้องคลอด', numeric: true, cell: (h) => dash(h.counts.total) },
  { key: 'parto', header: 'พาร์โทกราฟ', numeric: true, cell: (h) => <PartoCell hospital={h} /> },
  { key: 'sync', header: 'ซิงค์ล่าสุด', cell: (h) => <SyncCell hospital={h} /> },
];

function RosterCard({
  hospital: h,
  selected,
  onHover,
}: {
  hospital: DashboardHospital;
  selected: boolean;
  onHover: () => void;
}) {
  return (
    <Link
      href={`/hospitals/${h.hcode}`}
      data-testid={`hospital-card-${h.hcode}`}
      data-hcode={h.hcode}
      onPointerEnter={onHover}
      className={cn(
        'block rounded-xl border border-border px-3 py-2.5 hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand',
        selected && 'bg-brand-soft',
      )}
    >
      <HospitalName hospital={h} asLink={false} />
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-label text-ink-muted">
        <span>
          ANC <b className="tabular-nums text-ink">{dash(h.ancCounts.total)}</b>
        </span>
        <span>
          ห้องคลอด <b className="tabular-nums text-ink">{dash(h.counts.total)}</b>
        </span>
        <span className="inline-flex items-center gap-1">
          พาร์โทกราฟ <PartoCell hospital={h} />
        </span>
        <SyncCell hospital={h} />
      </div>
    </Link>
  );
}

export default function HospitalsPage() {
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'โรงพยาบาล' }]);
  const router = useRouter();
  const { hospitals, isLoading, error, updatedAt, mutate } = useDashboard();
  const [area, setArea] = useState<RosterArea>('nan');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const rosterRef = useRef<HTMLDivElement>(null);

  const nan = useMemo(() => hospitals.filter((h) => rosterArea(h) === 'nan'), [hospitals]);
  const other = useMemo(() => hospitals.filter((h) => rosterArea(h) === 'other'), [hospitals]);
  const areaHospitals = area === 'nan' ? nan : other;
  // Search narrows the roster only — the map keeps the whole area for
  // spatial context.
  const roster = useMemo(() => searchRoster(areaHospitals, search), [areaHospitals, search]);
  const groups = useMemo(() => groupRosterByLevel(roster), [roster]);
  const s = useMemo(() => summarizeRoster(areaHospitals), [areaHospitals]);

  // A pin click selects a hospital: bring its row/card into view inside the
  // roster pane (hidden view's copy is display:none, so the call is a no-op).
  useEffect(() => {
    if (!selected || !rosterRef.current) return;
    for (const el of rosterRef.current.querySelectorAll<HTMLElement>('[data-hcode]')) {
      if (el.dataset.hcode === selected)
        el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selected]);

  if (isLoading) return <LoadingState message="กำลังโหลดรายชื่อโรงพยาบาล..." />;

  // Fetch failed with nothing cached — an all-zero roster would look like an
  // empty province, so show the failure instead.
  if (error && !updatedAt) {
    return (
      <ErrorState
        message="ไม่สามารถโหลดข้อมูลโรงพยาบาลได้"
        detail={error instanceof Error ? error.message : String(error)}
        remedy={NETWORK_RETRY_REMEDY}
        onRetry={() => mutate()}
      />
    );
  }

  return (
    <ListPageLayout
      title="โรงพยาบาลในเครือข่าย"
      subtitle="สถานะการส่งข้อมูล ห้องคลอด และทะเบียนฝากครรภ์ รายโรงพยาบาล"
      updatedAt={updatedAt}
      stale={
        error
          ? {
              message: 'การเชื่อมต่อล้มเหลว — แสดงข้อมูลโรงพยาบาลเดิมจากแคช',
              onRetry: () => void mutate(),
              refreshSeconds: LIST_PAGE.refreshMs / 1000,
            }
          : null
      }
      actions={
        <FilterChips
          label="พื้นที่"
          hideLabel
          value={area}
          onChange={(v) => {
            setArea(v as RosterArea);
            setSelected(null);
          }}
          options={[
            { value: 'nan', label: 'จ.น่าน', count: nan.length },
            { value: 'other', label: 'จังหวัดอื่น / ภายนอก', count: other.length },
          ]}
        />
      }
    >
      <SectionCard
        title="ภาพรวมเครือข่าย"
        description="สรุปสถานะการส่งข้อมูลและภาระงานของโรงพยาบาลในพื้นที่ที่เลือก"
      >
        <KpiGrid min="md">
          <KpiTile
            testId="kpi-roster"
            label="โรงพยาบาลในพื้นที่นี้"
            count={s.hospitals}
            unit="แห่ง"
            sub={`มีผู้ป่วยในระบบ ${s.withWorkload} แห่ง`}
            hint={{
              title: 'โรงพยาบาลในพื้นที่ที่เลือก',
              body: 'จำนวนโรงพยาบาลในพื้นที่ที่เลือก (จ.น่าน หรือภายนอก) และจำนวนแห่งที่มีผู้ป่วยในระบบ — นับจากภาระงานรวมห้องคลอดและทะเบียนฝากครรภ์',
            }}
          />
          <KpiTile
            testId="kpi-sync"
            label={`ข้อมูลสด (ซิงค์ภายใน ${SYNC_HEALTH.staleAfterMinutes} นาที)`}
            count={s.sync.ok}
            unit={`/ ${s.hospitals} แห่ง`}
            tone={s.syncAttention > 0 ? 'warn' : 'default'}
            sub={`ล่าช้า ${s.sync.stale + s.sync.critical} · ${SYNC_HEALTH_TH.never} ${s.sync.never} · ${SYNC_HEALTH_TH.blocked} ${s.sync.blocked}`}
            hint={{
              title: 'ความสดของข้อมูล (ไม่ใช่แค่การเชื่อมต่อ)',
              body: `นับโรงพยาบาลที่ซิงค์ข้อมูลจาก HOSxP ภายใน ${SYNC_HEALTH.staleAfterMinutes} นาทีล่าสุด — ล่าช้า = เกิน ${SYNC_HEALTH.staleAfterMinutes} นาที (แดงเมื่อเกิน ${SYNC_HEALTH.criticalAfterHours} ชม.), ${SYNC_HEALTH_TH.never} = ไม่เคยมีข้อมูล, ${SYNC_HEALTH_TH.blocked} = ระบบระงับการซิงค์ (ดูเหตุผลที่แถวรายชื่อ) — สถานะ "${HOSPITAL_LINK_STATUS.online.labelTh}" อย่างเดียวไม่รับประกันว่าข้อมูลเป็นปัจจุบัน`,
            }}
          />
          <KpiTile
            testId="kpi-anc"
            label={ANC_REGISTRY_LABEL_TH}
            count={s.anc}
            unit="ราย"
            sub={`ครรภ์เสี่ยงสูง HR3 ${s.ancHr3} ราย`}
            hint={{
              title: 'ทะเบียนฝากครรภ์ทั้งพื้นที่',
              body: `ผลรวมของทุกโรงพยาบาลในพื้นที่นี้ — ${ANC_REGISTRY_CRITERIA_TH}`,
            }}
          />
          <KpiTile
            testId="kpi-labor"
            label="ผู้คลอดในห้องคลอด"
            count={s.labor.total}
            unit="ราย"
            sub={
              s.labor.total > 0 ? (
                <span className="flex flex-col gap-1">
                  <RiskBar
                    low={s.labor.low}
                    medium={s.labor.medium}
                    high={s.labor.high}
                    height={6}
                  />
                  <span>เสี่ยงสูง {s.labor.high} ราย</span>
                </span>
              ) : (
                'ไม่มีผู้คลอดที่กำลังรอคลอด'
              )
            }
            hint={{
              title: 'ห้องคลอดทั้งพื้นที่',
              body: 'ผู้ที่กำลังรอคลอด (labor_status = ACTIVE) รวมทุกโรงพยาบาล แถบสีคือสัดส่วนความเสี่ยง CPD ล่าสุด: ต่ำ / ปานกลาง / สูง',
            }}
          />
          <KpiTile
            testId="kpi-partograph"
            label={`การบันทึกพาร์โทกราฟ (${PARTOGRAPH_QUALITY.windowDays} วัน)`}
            count={s.parto.pct}
            unit="%"
            tone={s.parto.below > 0 ? 'warn' : 'default'}
            sub={`บันทึก ${s.parto.charted}/${s.parto.recent} ราย · ${s.parto.below > 0 ? `ต่ำกว่าเกณฑ์ ${s.parto.below} แห่ง` : 'ทุกแห่งผ่านเกณฑ์'}`}
            hint={{
              title: 'คุณภาพการบันทึกพาร์โทกราฟ',
              body: `สัดส่วนผู้คลอดที่รับใหม่ใน ${PARTOGRAPH_QUALITY.windowDays} วันที่ผ่านมา ที่มีการบันทึกพาร์โทกราฟอย่างน้อย 1 จุด — ต่ำกว่า ${PARTOGRAPH_QUALITY.warnBelowPct}% สีเหลือง ต่ำกว่า ${PARTOGRAPH_QUALITY.criticalBelowPct}% สีแดง หากโรงพยาบาลไม่บันทึกเลย ส่วนกลางจะมองไม่เห็นภาวะวิกฤตระหว่างคลอด`,
            }}
          />
        </KpiGrid>
      </SectionCard>

      {/* Two columns only when the page content is wide enough (spec L4):
          640px keeps the roster table at ≥ 560px inside its card. */}
      <div className="grid grid-cols-1 items-start gap-5 @min-[1160px]:grid-cols-[minmax(0,1fr)_640px]">
        <SectionCard
          title="แผนที่เครือข่ายโรงพยาบาล"
          description="ขนาดวงกลม = จำนวนผู้คลอด · สี = ความเสี่ยงสูงสุด · จุดมุม = สถานะการเชื่อมต่อ"
          className="min-w-0"
        >
          <div className="h-[360px] overflow-hidden rounded-xl border border-border @min-[1160px]:h-[max(480px,calc(100dvh_-_var(--app-header-h,0px)_-_260px))]">
            <ProvinceMap
              hospitals={areaHospitals}
              selected={selected}
              onSelect={setSelected}
              size="full"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="รายชื่อโรงพยาบาล"
          actions={
            <span className="text-label text-ink-muted">
              แสดง {roster.length} จาก {areaHospitals.length} แห่ง
            </span>
          }
          className="min-w-0"
        >
          <SearchField
            label="ค้นหา"
            value={search}
            onChange={setSearch}
            placeholder="ชื่อหรือรหัสโรงพยาบาล"
          />
          <div
            ref={rosterRef}
            className="mt-4 flex flex-col gap-5 @min-[1160px]:max-h-[calc(100dvh_-_var(--app-header-h,0px)_-_200px)] @min-[1160px]:overflow-y-auto"
          >
            {groups.length === 0 ? (
              <EmptyState
                title="ไม่พบโรงพยาบาลที่ตรงกับคำค้น"
                description='ลองค้นด้วยชื่อย่อ เช่น "พล" หรือรหัส 5 หลัก'
              />
            ) : (
              groups.map((g) => (
                <section key={g.level} aria-label={g.nameTh}>
                  <h3 className="text-body-lg font-semibold text-brand">
                    {g.nameTh}{' '}
                    <span className="text-label font-normal text-ink-muted">
                      · {g.hospitals.length} แห่ง
                    </span>
                  </h3>
                  <p className="mb-2 text-caption text-ink-muted">
                    ANC {g.stats.anc.toLocaleString('en-US')} · ห้องคลอด {g.stats.labor}
                    {g.stats.high > 0 ? ` · เสี่ยงสูง ${g.stats.high}` : ''}
                  </p>
                  <ResponsiveTable<DashboardHospital>
                    tableFrom="sm"
                    caption={`${g.nameTh} — รายชื่อโรงพยาบาล`}
                    cardListLabel={`${g.nameTh} — รายชื่อโรงพยาบาล`}
                    columns={ROSTER_COLUMNS}
                    rows={g.hospitals}
                    rowKey={(h) => h.hcode}
                    rowAttrs={(h) => ({
                      'data-testid': `hospital-row-${h.hcode}`,
                      'data-sync': classifySyncHealth(h.syncStatus, h.lastSyncAt),
                      'data-hcode': h.hcode,
                    })}
                    isRowSelected={(h) => h.hcode === selected}
                    onRowPointerEnter={(h) => setSelected(h.hcode)}
                    onRowClick={(h) => router.push(`/hospitals/${h.hcode}`)}
                    rowLabel={(h) => `เปิดหน้าโรงพยาบาล ${h.name}`}
                    renderCard={(h) => (
                      <RosterCard
                        hospital={h}
                        selected={h.hcode === selected}
                        onHover={() => setSelected(h.hcode)}
                      />
                    )}
                  />
                </section>
              ))
            )}
          </div>
        </SectionCard>
      </div>
    </ListPageLayout>
  );
}
