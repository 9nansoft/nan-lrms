'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { PatientCard } from '@/components/patient/PatientCard';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { LoadingState } from '@/components/shared/LoadingState';
import { Building2, ArrowLeft } from 'lucide-react';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';

interface PatientRow {
  id: string;
  hn: string;
  an: string;
  name: string;
  age: number;
  gravida: number | null;
  ga_weeks: number | null;
  anc_count: number | null;
  admit_date: string;
  labor_status: string;
  cpd_score: number | null;
  cpd_risk_level: string | null;
  latest_vitals?: {
    maternal_hr: number | null;
    fetal_hr: string | null;
    sbp: number | null;
    dbp: number | null;
  } | null;
  latest_cervix_cm?: number | null;
}

interface HospitalInfo {
  name: string;
  level: string;
  connectionStatus: string;
  lastSyncAt: string | null;
}

export default function HospitalPatientListPage({
  params,
}: {
  params: Promise<{ hcode: string }>;
}) {
  const { hcode } = use(params);
  const router = useRouter();

  const { data, isLoading } = useSWR(`/api/hospitals/${hcode}/patients`, {
    refreshInterval: 30000,
  });

  const hospitalName = data?.hospital?.name ?? `รหัส ${hcode}`;
  useSetBreadcrumbs([
    { label: 'แดชบอร์ด', href: '/' },
    { label: 'โรงพยาบาล', href: '/hospitals' },
    { label: hospitalName },
  ]);

  if (isLoading) {
    return <LoadingState message="กำลังโหลดรายชื่อผู้คลอด..." />;
  }

  const patients: PatientRow[] = data?.patients ?? [];
  const hospital: HospitalInfo | undefined = data?.hospital;

  const riskOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  const sortedPatients = [...patients].sort(
    (a, b) => (riskOrder[a.cpd_risk_level ?? 'LOW'] ?? 3) - (riskOrder[b.cpd_risk_level ?? 'LOW'] ?? 3),
  );

  return (
    <div className="space-y-5">
      <button
        onClick={() => router.push('/')}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-600"
      >
        <ArrowLeft size={16} /> กลับแดชบอร์ด
      </button>

      <div className="rounded-xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-50 text-teal-600">
            <Building2 size={20} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-800">
              {hospital?.name ?? `รหัส ${hcode}`}
            </h1>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              {hospital?.level && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium">
                  {hospital.level}
                </span>
              )}
              {hospital?.connectionStatus && (
                <ConnectionStatus
                  status={hospital.connectionStatus as ConnectionStatusEnum}
                  lastSyncAt={hospital.lastSyncAt ?? null}
                />
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 text-sm text-slate-600">
          ผู้คลอด <span className="font-semibold">{patients.length}</span> ราย
        </div>
      </div>

      {sortedPatients.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center text-slate-400 shadow-sm">
          ไม่มีผู้คลอดในขณะนี้
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sortedPatients.map((p) => (
            <PatientCard
              key={p.id || p.an}
              hcode={hcode}
              an={p.an}
              hn={p.hn}
              name={p.name}
              age={p.age}
              gravida={p.gravida}
              gaWeeks={p.ga_weeks}
              ancCount={p.anc_count}
              admitDate={p.admit_date}
              laborStatus={p.labor_status}
              cpdScore={p.cpd_score}
              cpdRiskLevel={p.cpd_risk_level}
              latestVitals={p.latest_vitals ? {
                maternalHr: p.latest_vitals.maternal_hr,
                fetalHr: p.latest_vitals.fetal_hr,
                sbp: p.latest_vitals.sbp,
                dbp: p.latest_vitals.dbp,
              } : null}
              latestCervixCm={p.latest_cervix_cm}
            />
          ))}
        </div>
      )}
    </div>
  );
}
