// Hospitals page — hospital-level view with province tabs
'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboard } from '@/hooks/useDashboard';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { LoadingState } from '@/components/shared/LoadingState';
import { HOSPITAL_LEVELS, KK_HOSPITALS } from '@/config/hospitals';
import { Search, Building2, Users, ChevronRight, Globe } from 'lucide-react';
import type { DashboardHospital } from '@/types/api';
import type { HospitalLevel } from '@/types/domain';

// Set of Khon Kaen hcodes for fast lookup
const KK_HCODES = new Set(KK_HOSPITALS.map((h) => h.hcode));

type TabKey = 'khonkaen' | 'other';

/** Group hospitals by level, sorted by HOSPITAL_LEVELS sortOrder */
function groupByLevel(hospitals: DashboardHospital[]) {
  const groups = new Map<HospitalLevel, DashboardHospital[]>();

  const sortedLevels = Object.values(HOSPITAL_LEVELS).sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );

  for (const config of sortedLevels) {
    groups.set(config.level, []);
  }

  for (const h of hospitals) {
    const list = groups.get(h.level);
    if (list) {
      list.push(h);
    } else {
      // External hospitals may have levels not in HOSPITAL_LEVELS — put in a catch-all
      const other = groups.get('M2' as HospitalLevel) ?? [];
      other.push(h);
    }
  }

  // Remove empty groups
  for (const [level, list] of groups) {
    if (list.length === 0) groups.delete(level);
  }

  return groups;
}

function HospitalRow({ hospital }: { hospital: DashboardHospital }) {
  const router = useRouter();
  const hasPatients = hospital.counts.total > 0;

  return (
    <button
      type="button"
      onClick={() => router.push(`/hospitals/${hospital.hcode}`)}
      className="group flex w-full items-center gap-4 rounded-xl bg-white p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.05)]"
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${hasPatients ? 'bg-emerald-50' : 'bg-slate-50'}`}>
        <Building2 className={`h-5 w-5 ${hasPatients ? 'text-emerald-500' : 'text-slate-300'}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{hospital.name}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-500">
            {hospital.hcode}
          </span>
        </div>
        <div className="mt-1">
          <ConnectionStatus
            status={hospital.connectionStatus}
            lastSyncAt={hospital.lastSyncAt}
            className="text-xs"
          />
        </div>
      </div>

      {hasPatients ? (
        <div className="flex items-center gap-3">
          <div className="hidden items-center gap-2 sm:flex">
            {hospital.counts.high > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                {hospital.counts.high}
              </span>
            )}
            {hospital.counts.medium > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                {hospital.counts.medium}
              </span>
            )}
            {hospital.counts.low > 0 && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                {hospital.counts.low}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
            <Users className="h-3.5 w-3.5" />
            <span className="font-mono text-sm font-bold">{hospital.counts.total}</span>
          </div>
        </div>
      ) : (
        <span className="text-xs text-slate-300">ไม่มีผู้คลอด</span>
      )}

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function TabButton({
  active,
  onClick,
  children,
  count,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  count: number;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
      }`}
    >
      {icon}
      {children}
      <span className={`rounded-full px-2 py-0.5 font-mono text-xs ${
        active ? 'bg-slate-100 text-slate-600' : 'bg-slate-200/50 text-slate-400'
      }`}>
        {count}
      </span>
    </button>
  );
}

function HospitalList({ hospitals, search }: { hospitals: DashboardHospital[]; search: string }) {
  const filtered = useMemo(() => {
    if (!search.trim()) return hospitals;
    const q = search.trim().toLowerCase();
    return hospitals.filter(
      (h) =>
        h.name.toLowerCase().includes(q) ||
        h.hcode.toLowerCase().includes(q),
    );
  }, [hospitals, search]);

  const grouped = useMemo(() => groupByLevel(filtered), [filtered]);

  if (grouped.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 text-center shadow-sm">
        <Building2 className="mb-3 h-10 w-10 text-slate-200" />
        <p className="text-sm text-slate-400">
          {search ? 'ไม่พบโรงพยาบาลที่ตรงกับการค้นหา' : 'ไม่มีโรงพยาบาลในกลุ่มนี้'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([level, levelHospitals]) => {
        const config = HOSPITAL_LEVELS[level];
        const levelPatients = levelHospitals.reduce((sum, h) => sum + h.counts.total, 0);
        const levelOnline = levelHospitals.filter((h) => h.connectionStatus === 'ONLINE').length;

        return (
          <div key={level} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
                  {config?.nameTh ?? level}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500">
                  {levelHospitals.length}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  ออนไลน์ {levelOnline}/{levelHospitals.length}
                </span>
                {levelPatients > 0 && (
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    ผู้คลอด {levelPatients}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
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

  // Split hospitals by province
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">โรงพยาบาล</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {currentHospitals.length} แห่ง — ออนไลน์ {onlineCount} — ผู้คลอด {totalPatients} — มีผู้คลอด {withPatients} แห่ง
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อหรือรหัส..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-300 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
        <TabButton
          active={activeTab === 'khonkaen'}
          onClick={() => setActiveTab('khonkaen')}
          count={kkHospitals.length}
          icon={<Building2 className="h-4 w-4" />}
        >
          จ.ขอนแก่น
        </TabButton>
        <TabButton
          active={activeTab === 'other'}
          onClick={() => setActiveTab('other')}
          count={otherHospitals.length}
          icon={<Globe className="h-4 w-4" />}
        >
          จังหวัดอื่น / ภายนอก
        </TabButton>
      </div>

      {/* Hospital list for active tab */}
      <HospitalList hospitals={currentHospitals} search={search} />
    </div>
  );
}
