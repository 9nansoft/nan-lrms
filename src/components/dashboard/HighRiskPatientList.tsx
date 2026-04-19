// HighRiskPatientList — table/list of high-risk patients across all hospitals
'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertTriangle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CpdBadge } from '@/components/shared/CpdBadge';
import { cn, formatRelativeTime, buildPatientId } from '@/lib/utils';
import { RiskLevel } from '@/types/domain';
import type { CdssSeverity } from '@/types/api';
import {
  SEVERITY_DOT,
  SEVERITY_LABEL_TH,
} from '@/components/patient/cdss-presentation';

export interface HighRiskPatient {
  an: string;
  hn: string;
  name: string;
  age: number | null;
  gaWeeks: number | null;
  cpdScore: number;
  riskLevel: string;
  hospital: string;
  hcode: string;
  admitDate: string | null;
  lastVitalAt: string | null;
  partographSeverity?: CdssSeverity | null;
  partographAlertCount?: number | null;
}

function PartographSeverityDot({ patient }: { patient: HighRiskPatient }) {
  if (!patient.partographSeverity) return null;
  const count = patient.partographAlertCount ?? 0;
  return (
    <span
      data-testid={`partograph-severity-dot-${patient.an}`}
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        SEVERITY_DOT[patient.partographSeverity],
      )}
      title={`Partograph: ${SEVERITY_LABEL_TH[patient.partographSeverity]} (${count} ข้อ)`}
    />
  );
}

export interface HighRiskPatientListProps {
  patients: HighRiskPatient[];
  isLoading?: boolean;
}

function RiskDot({ riskLevel }: { riskLevel: string }) {
  const colorClass =
    riskLevel === 'HIGH'
      ? 'bg-red-500'
      : riskLevel === 'MEDIUM'
        ? 'bg-amber-500'
        : 'bg-green-500';

  return (
    <span
      data-risk={riskLevel}
      className={cn('inline-block h-2.5 w-2.5 rounded-full', colorClass)}
      aria-label={riskLevel === 'HIGH' ? 'เสี่ยงสูง' : riskLevel === 'MEDIUM' ? 'เสี่ยงปานกลาง' : 'เสี่ยงต่ำ'}
    />
  );
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-8 animate-pulse rounded bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-8 animate-pulse rounded bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-5 w-10 animate-pulse rounded-full bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          </TableCell>
          <TableCell>
            <div className="h-4 w-20 animate-pulse rounded bg-slate-200" />
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function MobileSkeletonCards() {
  return (
    <>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-xl border p-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 animate-pulse rounded-full bg-slate-200" />
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
          </div>
          <div className="mt-3 flex gap-4">
            <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-4 w-16 animate-pulse rounded bg-slate-200" />
            <div className="h-5 w-10 animate-pulse rounded-full bg-slate-200" />
          </div>
          <div className="mt-2 h-3 w-24 animate-pulse rounded bg-slate-200" />
        </div>
      ))}
    </>
  );
}

export function HighRiskPatientList({ patients, isLoading = false }: HighRiskPatientListProps) {
  const router = useRouter();

  const sorted = useMemo(
    () => [...patients].sort((a, b) => b.cpdScore - a.cpdScore),
    [patients],
  );

  const handleRowClick = (hcode: string, an: string) => {
    router.push(`/patients/${buildPatientId(hcode, an)}`);
  };

  return (
    <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <AlertTriangle className="h-5 w-5 text-red-500" />
        <h2 className="text-sm font-medium uppercase tracking-wider text-slate-500">
          ผู้ป่วยเสี่ยงสูง
        </h2>
        {!isLoading && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-100 px-2 text-xs font-bold text-red-700">
            {patients.length}
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <>
          {/* Desktop skeleton */}
          <div className="hidden md:block px-6 pb-6">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>ชื่อผู้ป่วย</TableHead>
                    <TableHead>อายุ</TableHead>
                    <TableHead>GA</TableHead>
                    <TableHead>CPD</TableHead>
                    <TableHead>โรงพยาบาล</TableHead>
                    <TableHead>Admit</TableHead>
                    <TableHead>Vital ล่าสุด</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <SkeletonRows />
                </TableBody>
              </Table>
            </div>
          </div>
          {/* Mobile skeleton */}
          <div className="md:hidden px-4 pb-4 space-y-3">
            <MobileSkeletonCards />
          </div>
        </>
      )}

      {/* Empty State */}
      {!isLoading && patients.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 px-6 pb-8 pt-4">
          <CheckCircle className="h-12 w-12 text-green-400" />
          <p className="text-sm text-slate-500">ไม่มีผู้ป่วยเสี่ยงสูง</p>
        </div>
      )}

      {/* Desktop Table */}
      {!isLoading && sorted.length > 0 && (
        <div className="hidden md:block px-6 pb-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>ชื่อผู้ป่วย</TableHead>
                  <TableHead>อายุ</TableHead>
                  <TableHead>GA</TableHead>
                  <TableHead>CPD</TableHead>
                  <TableHead>โรงพยาบาล</TableHead>
                  <TableHead>Admit</TableHead>
                  <TableHead>Vital ล่าสุด</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((patient) => {
                  // Critical glow fires for HIGH CPD risk OR CRITICAL partograph severity —
                  // either signal warrants the red row accent on kiosk monitor.
                  const isCriticalGlow =
                    patient.riskLevel === 'HIGH' || patient.partographSeverity === 'CRITICAL';
                  return (
                  <TableRow
                    key={patient.an}
                    data-testid="patient-row"
                    className={cn(
                      'cursor-pointer hover:bg-slate-50 transition-colors',
                      isCriticalGlow && 'border-l-2 border-l-red-400',
                      !isCriticalGlow && patient.riskLevel === 'MEDIUM' && 'border-l-2 border-l-amber-400',
                    )}
                    onClick={() => handleRowClick(patient.hcode, patient.an)}
                  >
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5">
                        <RiskDot riskLevel={patient.riskLevel} />
                        <PartographSeverityDot patient={patient} />
                      </span>
                    </TableCell>
                    <TableCell className="font-mono font-medium">AN {patient.an}</TableCell>
                    <TableCell className="font-mono">
                      {patient.age != null ? patient.age : '-'}
                    </TableCell>
                    <TableCell className="font-mono">
                      {patient.gaWeeks != null ? patient.gaWeeks : '-'}
                    </TableCell>
                    <TableCell>
                      <CpdBadge
                        score={patient.cpdScore}
                        riskLevel={patient.riskLevel as RiskLevel}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-slate-600">{patient.hospital}</TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatRelativeTime(patient.admitDate)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500">
                      {formatRelativeTime(patient.lastVitalAt)}
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Mobile Card List */}
      {!isLoading && sorted.length > 0 && (
        <div className="md:hidden px-4 pb-4 space-y-3">
          {sorted.map((patient) => {
            const isCriticalGlow =
              patient.riskLevel === 'HIGH' || patient.partographSeverity === 'CRITICAL';
            return (
            <div
              key={patient.an}
              data-testid="patient-row"
              className={cn(
                'cursor-pointer rounded-xl border p-4 transition-colors hover:bg-slate-50',
                isCriticalGlow && 'border-l-4 border-l-red-400',
                !isCriticalGlow && patient.riskLevel === 'MEDIUM' && 'border-l-4 border-l-amber-400',
              )}
              onClick={() => handleRowClick(patient.hcode, patient.an)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleRowClick(patient.hcode, patient.an);
                }
              }}
            >
              {/* Top row: risk dot + name + CPD badge */}
              <div className="flex items-center gap-2">
                <RiskDot riskLevel={patient.riskLevel} />
                <PartographSeverityDot patient={patient} />
                <span className="flex-1 truncate font-mono font-medium text-base">AN {patient.an}</span>
                <CpdBadge
                  score={patient.cpdScore}
                  riskLevel={patient.riskLevel as RiskLevel}
                  size="sm"
                />
              </div>

              {/* Details row */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                {patient.age != null && (
                  <span>อายุ <span className="font-mono font-medium text-slate-700">{patient.age}</span></span>
                )}
                {patient.gaWeeks != null && (
                  <span>GA <span className="font-mono font-medium text-slate-700">{patient.gaWeeks}</span> wks</span>
                )}
                <span>{patient.hospital}</span>
              </div>

              {/* Time row */}
              <div className="mt-1 text-sm text-slate-400">
                Vital: {formatRelativeTime(patient.lastVitalAt)}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
