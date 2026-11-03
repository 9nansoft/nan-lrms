// T008: PatientCard — card component for hospital patient list
'use client';

import Link from 'next/link';
import { CpdBadge } from '@/components/shared/CpdBadge';
import { formatThaiDate, buildPatientId } from '@/lib/utils';
import { RiskLevel } from '@/types/domain';

interface PatientCardProps {
  hcode: string;
  an: string;
  hn: string;
  name: string;
  age: number;
  gravida: number | null;
  gaWeeks: number | null;
  ancCount: number | null;
  admitDate: string;
  laborStatus: string;
  cpdScore: number | null;
  cpdRiskLevel: string | null;
  latestVitals?: {
    maternalHr: number | null;
    fetalHr: string | null;
    sbp: number | null;
    dbp: number | null;
  } | null;
  latestCervixCm?: number | null;
}

const RISK_STRIP_COLOR: Record<string, string> = {
  HIGH: 'bg-danger',
  MEDIUM: 'bg-warn',
  LOW: 'bg-ok',
};

const LABOR_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'คลอดอยู่',
  DELIVERED: 'คลอดแล้ว',
  TRANSFERRED: 'ส่งต่อแล้ว',
};

/**
 * Formats a relative time string in Thai, e.g. "8 ชม. ที่แล้ว"
 */
function formatRelativeTimeThai(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();

  if (diffMs < 0) return 'เมื่อสักครู่';

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'เมื่อสักครู่';
  if (diffMinutes < 60) return `${diffMinutes} นาทีที่แล้ว`;
  if (diffHours < 24) return `${diffHours} ชม. ที่แล้ว`;
  if (diffDays === 1) return 'เมื่อวาน';
  return `${diffDays} วันที่แล้ว`;
}

/** Determine if a vital value is abnormal for color coding */
function isVitalAbnormal(label: string, value: string): boolean {
  const num = parseFloat(value.split('/')[0]);
  if (isNaN(num)) return false;
  switch (label) {
    case 'MHR': return num < 60 || num > 100;
    case 'FHR': return num < 110 || num > 160;
    case 'BP': {
      const parts = value.split('/');
      const sbp = parseFloat(parts[0]);
      const dbp = parts[1] ? parseFloat(parts[1]) : null;
      return sbp > 140 || sbp < 90 || (dbp !== null && (dbp > 90 || dbp < 60));
    }
    case 'Cervix': return false; // cervix is not abnormal by value
    default: return false;
  }
}

interface VitalPillProps {
  label: string;
  value: string;
  unit: string;
}

function VitalPill({ label, value, unit }: VitalPillProps) {
  const abnormal = isVitalAbnormal(label, value);
  const valueColor = abnormal ? 'text-danger-text' : 'text-slate-600';

  return (
    <div className="flex flex-col items-center bg-slate-50 text-sm px-2.5 py-1.5 rounded-lg">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono font-semibold ${valueColor}`}>{value}</span>
      <span className="text-slate-400">{unit}</span>
    </div>
  );
}

export function PatientCard({
  hcode,
  an,
  hn,
  name,
  age,
  gravida,
  gaWeeks,
  ancCount,
  admitDate,
  laborStatus,
  cpdScore,
  cpdRiskLevel,
  latestVitals,
  latestCervixCm,
}: PatientCardProps) {
  const stripClass = cpdRiskLevel
    ? (RISK_STRIP_COLOR[cpdRiskLevel] ?? 'bg-slate-200')
    : 'bg-slate-200';

  const laborLabel = LABOR_STATUS_LABELS[laborStatus] ?? laborStatus;

  const hasVitals =
    latestVitals?.maternalHr != null ||
    latestVitals?.fetalHr != null ||
    latestVitals?.sbp != null ||
    latestCervixCm != null;

  return (
    <Link
      href={`/patients/${buildPatientId(hcode, an)}`}
      className="block transition-all hover:-translate-y-0.5"
    >
      <div
        className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06),0_8px_24px_rgba(0,0,0,0.05)] overflow-hidden"
      >
        {/* Risk indicator strip */}
        <div className={`h-0.5 rounded-t-2xl -mx-5 -mt-5 mb-4 ${stripClass}`} />

        {/* Row 1: Name + CpdBadge + Labor status */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-lg font-semibold text-slate-800">AN {an}</span>
          {cpdScore != null && cpdRiskLevel && (
            <CpdBadge
              score={cpdScore}
              riskLevel={cpdRiskLevel as RiskLevel}
              size="sm"
            />
          )}
          {laborStatus === 'ACTIVE' ? (
            <span className="bg-ok-tint text-ok-text text-sm font-medium px-2.5 py-0.5 rounded-full">
              {laborLabel}
            </span>
          ) : (
            <span className="bg-slate-100 text-slate-600 text-sm font-medium px-2.5 py-0.5 rounded-full">
              {laborLabel}
            </span>
          )}
        </div>

        {/* Row 2: Demographics */}
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-sm text-slate-400">
          <span>AN: <span className="font-mono">{an}</span></span>
          <span>HN: <span className="font-mono">{hn}</span></span>
          <span>อายุ <span className="font-mono">{age}</span> ปี</span>
          {gravida != null && <span>G<span className="font-mono">{gravida}</span></span>}
        </div>

        {/* Row 3: GA + ANC count */}
        <div className="mt-1 flex flex-wrap gap-x-3 text-sm text-slate-400">
          {gaWeeks != null && <span>GA <span className="font-mono">{gaWeeks}</span> สัปดาห์</span>}
          {ancCount != null && <span>ANC <span className="font-mono">{ancCount}</span> ครั้ง</span>}
        </div>

        {/* Row 4: Latest vitals preview */}
        {hasVitals && (
          <div className="mt-3 flex flex-wrap gap-2">
            {latestVitals?.maternalHr != null && (
              <VitalPill
                label="MHR"
                value={String(latestVitals.maternalHr)}
                unit="bpm"
              />
            )}
            {latestVitals?.fetalHr != null && (
              <VitalPill
                label="FHR"
                value={latestVitals.fetalHr}
                unit="bpm"
              />
            )}
            {latestVitals?.sbp != null && latestVitals?.dbp != null && (
              <VitalPill
                label="BP"
                value={`${latestVitals.sbp}/${latestVitals.dbp}`}
                unit="mmHg"
              />
            )}
            {latestCervixCm != null && (
              <VitalPill
                label="Cervix"
                value={String(latestCervixCm)}
                unit="cm"
              />
            )}
          </div>
        )}

        {/* Row 5: Admit date + relative time */}
        <div className="mt-3 text-sm text-slate-400">
          Admit: {formatThaiDate(new Date(admitDate))}{' '}
          <span className="text-slate-300">|</span>{' '}
          {formatRelativeTimeThai(admitDate)}
        </div>
      </div>
    </Link>
  );
}
