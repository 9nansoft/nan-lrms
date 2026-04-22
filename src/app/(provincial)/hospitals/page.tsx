// Hospitals — provincial hospital directory. Redesigned 2026-04-21 to match
// the dashboard's air-traffic-control aesthetic: cool-slate frame, flush
// white panels, navy accents, mono tabular numerics, sharp-cornered rows
// grouped by MoPH facility level, risk dots in the shared risk palette.
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/hooks/useDashboard';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionLabel } from '@/components/dashboard/shared';
import { HOSPITAL_LEVELS, KK_HOSPITALS } from '@/config/hospitals';
import { cn } from '@/lib/utils';
import { Search, Building2, ChevronRight, Globe } from 'lucide-react';
import type { DashboardHospital } from '@/types/api';
import type { HospitalLevel } from '@/types/domain';

const KK_HCODES = new Set(KK_HOSPITALS.map((h) => h.hcode));

type TabKey = 'khonkaen' | 'other';

function groupByLevel(hospitals: DashboardHospital[]) {
  const groups = new Map<HospitalLevel, DashboardHospital[]>();
  const sortedLevels = Object.values(HOSPITAL_LEVELS).sort((a, b) => a.sortOrder - b.sortOrder);
  for (const config of sortedLevels) groups.set(config.level, []);
  for (const h of hospitals) {
    const list = groups.get(h.level);
    if (list) list.push(h);
    else {
      const other = groups.get('M2' as HospitalLevel) ?? [];
      other.push(h);
    }
  }
  for (const [level, list] of groups) if (list.length === 0) groups.delete(level);
  return groups;
}

function HospitalRow({ hospital }: { hospital: DashboardHospital }) {
  const router = useRouter();
  const hasPatients = hospital.counts.total > 0;

  return (
    <button
      type="button"
      onClick={() => router.push(`/hospitals/${hospital.hcode}`)}
      className="group grid w-full items-center gap-3 border-b px-3 py-2 text-left transition-colors hover:bg-[var(--accent-navy-soft)]"
      style={{
        gridTemplateColumns: '20px 1fr 200px 130px 110px 16px',
        borderColor: 'var(--rule-hair)',
        minHeight: 44,
      }}
    >
      <Building2
        className="h-4 w-4"
        style={{
          color: hasPatients ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
          opacity: hasPatients ? 0.9 : 0.5,
        }}
      />
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-[13px] font-medium text-[var(--ink-navy)]">
          {hospital.name}
        </span>
        <span
          className="shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-navy-dim)]"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          {hospital.hcode}
        </span>
      </div>
      <div className="min-w-0">
        <ConnectionStatus
          status={hospital.connectionStatus}
          lastSyncAt={hospital.lastSyncAt}
          className="text-[11px]"
        />
      </div>
      <div className="flex items-center gap-2 font-mono text-[11px] tabular-nums text-[var(--ink-navy-dim)]">
        {hospital.counts.high > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--risk-high)' }} />
            {hospital.counts.high}
          </span>
        )}
        {hospital.counts.medium > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--risk-medium)' }} />
            {hospital.counts.medium}
          </span>
        )}
        {hospital.counts.low > 0 && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: 'var(--risk-low)' }} />
            {hospital.counts.low}
          </span>
        )}
        {!hasPatients && <span className="text-[var(--ink-navy-muted)]">—</span>}
      </div>
      <div
        className="text-right font-mono text-[13px] font-semibold tabular-nums"
        style={{
          color: hasPatients ? 'var(--accent-navy)' : 'var(--ink-navy-muted)',
        }}
      >
        {hasPatients ? hospital.counts.total : ''}
        {hasPatients && (
          <span className="ml-1 text-[10px] font-normal text-[var(--ink-navy-muted)]">
            act
          </span>
        )}
      </div>
      <ChevronRight
        className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
        style={{ color: 'var(--ink-navy-muted)' }}
      />
    </button>
  );
}

function HospitalList({ hospitals, search }: { hospitals: DashboardHospital[]; search: string }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return hospitals;
    const q = search.trim().toLowerCase();
    return hospitals.filter(
      (h) => h.name.toLowerCase().includes(q) || h.hcode.toLowerCase().includes(q),
    );
  }, [hospitals, search]);

  const grouped = useMemo(() => groupByLevel(filtered), [filtered]);

  if (grouped.size === 0) {
    return (
      <div
        className="border bg-white py-10 text-center"
        style={{ borderColor: 'var(--rule-strong)' }}
      >
        <Building2 className="mx-auto mb-2 h-8 w-8 text-[var(--ink-navy-muted)] opacity-50" />
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          {search ? 'ไม่พบโรงพยาบาลที่ตรงกับการค้นหา' : 'ไม่มีโรงพยาบาลในกลุ่มนี้'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([level, levelHospitals]) => {
        const config = HOSPITAL_LEVELS[level];
        const levelPatients = levelHospitals.reduce((sum, h) => sum + h.counts.total, 0);
        const levelOnline = levelHospitals.filter((h) => h.connectionStatus === 'ONLINE').length;

        return (
          <div key={level}>
            {/* Group header — mono eyebrow matching SectionLabel aesthetic */}
            <div
              className="flex items-center justify-between border bg-white px-3 py-2"
              style={{ borderColor: 'var(--rule-strong)' }}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--ink-navy-dim)]">
                  {config?.nameTh ?? level}
                </span>
                <span
                  className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--ink-navy-dim)]"
                  style={{ borderColor: 'var(--rule-strong)' }}
                >
                  {levelHospitals.length}
                </span>
              </div>
              <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.08em] text-[var(--ink-navy-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: 'var(--risk-low)' }}
                  />
                  ONLINE{' '}
                  <span className="tabular-nums text-[var(--ink-navy)]">
                    {levelOnline}/{levelHospitals.length}
                  </span>
                </span>
                {levelPatients > 0 && (
                  <span>
                    ACT{' '}
                    <span className="tabular-nums text-[var(--ink-navy)]">{levelPatients}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Rows */}
            <div
              className="border border-t-0 bg-white"
              style={{ borderColor: 'var(--rule-strong)' }}
            >
              {levelHospitals.map((h) => (
                <HospitalRow key={h.hcode} hospital={h} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function HospitalsPage() {
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'โรงพยาบาล' },
  ]);

  const { hospitals, isLoading } = useDashboard();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('khonkaen');

  const kkHospitals = useMemo(
    () => hospitals.filter((h) => KK_HCODES.has(h.hcode)),
    [hospitals],
  );
  const otherHospitals = useMemo(
    () => hospitals.filter((h) => !KK_HCODES.has(h.hcode)),
    [hospitals],
  );

  const currentHospitals = activeTab === 'khonkaen' ? kkHospitals : otherHospitals;

  const onlineCount = currentHospitals.filter((h) => h.connectionStatus === 'ONLINE').length;
  const withPatients = currentHospitals.filter((h) => h.counts.total > 0).length;
  const totalPatients = currentHospitals.reduce((sum, h) => sum + h.counts.total, 0);

  if (isLoading) {
    return <LoadingState message="กำลังโหลดรายชื่อโรงพยาบาล..." />;
  }

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
            PROVINCIAL REGISTRY · HOSPITALS
          </div>
          <h1
            className="mt-0.5 text-[22px] font-bold leading-tight tracking-tight"
            style={{ color: 'var(--ink-navy)' }}
          >
            โรงพยาบาล
          </h1>
        </div>
        <p className="font-mono text-[11px] text-[var(--ink-navy-muted)]">
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
            {currentHospitals.length}
          </span>{' '}
          แห่ง · ออนไลน์{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">{onlineCount}</span> · มีผู้คลอด{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">{withPatients}</span>{' '}
          แห่ง · รวม{' '}
          <span className="font-semibold text-[var(--ink-navy)] tabular-nums">
            {totalPatients}
          </span>{' '}
          ราย
        </p>
      </div>

      {/* 01 — Controls (tabs + search) */}
      <div
        className="flex flex-wrap items-center gap-3 bg-white px-5 py-2.5"
        style={{ borderBottom: '1px solid var(--rule-strong)' }}
      >
        {/* Tabs */}
        <div
          className="inline-flex items-center border bg-white"
          style={{ borderColor: 'var(--rule-strong)' }}
        >
          {(
            [
              { k: 'khonkaen' as const, label: 'จ.ขอนแก่น', count: kkHospitals.length, icon: Building2 },
              { k: 'other' as const, label: 'จังหวัดอื่น / ภายนอก', count: otherHospitals.length, icon: Globe },
            ]
          ).map((t, i) => {
            const active = activeTab === t.k;
            const Icon = t.icon;
            return (
              <button
                key={t.k}
                onClick={() => setActiveTab(t.k)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 font-mono text-[11px] tracking-[0.06em] transition-colors',
                  active ? 'font-semibold' : 'font-normal hover:bg-[var(--accent-navy-soft)]',
                )}
                style={{
                  background: active ? 'var(--accent-navy-soft)' : 'white',
                  color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  borderLeft: i > 0 ? '1px solid var(--rule-strong)' : undefined,
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
                <span
                  className="rounded-sm border px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
                  style={{
                    borderColor: active ? 'var(--accent-navy)' : 'var(--rule-strong)',
                    color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  }}
                >
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-navy-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือรหัส…"
            className="h-8 w-full rounded-sm border bg-white pl-8 pr-3 text-[12px] focus:border-[var(--accent-navy)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-navy-soft)]"
            style={{ borderColor: 'var(--rule-strong)' }}
          />
        </div>
      </div>

      {/* 02 — Directory */}
      <div className="bg-white px-5 pt-4 pb-6">
        <SectionLabel
          idx={2}
          right={
            <span>
              {currentHospitals.length} NODES · {onlineCount}/{currentHospitals.length} ONLINE
            </span>
          }
        >
          Hospital directory
        </SectionLabel>

        <div className="mt-2">
          <HospitalList hospitals={currentHospitals} search={search} />
        </div>
      </div>
    </div>
  );
}
