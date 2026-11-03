// src/components/patient/PatientHeader.tsx
// Patient identity band (direction C): brand-strong band with the masked name,
// labour status, identifier chips and the CPD score tile. Colours come from
// tokens. The weight-gain tone reuses the CPD weight-gain bands
// (CPD_FACTOR_WEIGHTS.weightDiffKg) instead of restating them.
'use client';

import type { ReactNode } from 'react';
import { Activity, AlertTriangle, Calendar, Hospital, Scale, ShieldCheck, User } from 'lucide-react';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { formatThaiDate, cn } from '@/lib/utils';
import { maskName } from '@/lib/pii-mask';
import { CPD_FACTOR_WEIGHTS, CPD_MAX_SCORE, RISK_LEVELS } from '@/config/risk-levels';
import { RiskLevel } from '@/types/domain';
import type { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';

interface PatientHeaderProps {
  hn: string;
  an: string;
  name: string;
  age: number;
  admitDate: string;
  laborStatus: string;
  weightKg?: number | null;
  weightDiffKg?: number | null;
  hospital: { name: string; level: string; connectionStatus?: ConnectionStatusEnum; lastSyncAt?: string | null };
  cpdScore?: { score: number; riskLevel: RiskLevel } | null;
}

type WeightTone = 'ok' | 'warn' | 'danger';
const WEIGHT_TONE_BY_POINTS: Record<number, WeightTone> = { 0: 'ok', 1: 'warn', 2: 'danger' };
// Light tints read clearly on the dark band (contrast > 7:1 against brand-strong).
const WEIGHT_TEXT: Record<WeightTone, string> = { ok: 'text-ok-tint', warn: 'text-warn-tint', danger: 'text-danger-tint' };

function Chip({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-label text-white">
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center text-white/70">
        {icon}
      </span>
      <span className="text-white/70">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function CpdTile({ score, riskLevel }: { score: number; riskLevel: RiskLevel }) {
  // PGlite returns NUMERIC columns as strings on some paths; coerce first.
  const scoreNum = typeof score === 'number' ? score : Number(score);
  const cfg = RISK_LEVELS[riskLevel];
  const Icon = riskLevel === RiskLevel.LOW ? ShieldCheck : AlertTriangle;
  return (
    <div
      className="flex shrink-0 flex-col items-end gap-1 rounded-2xl px-4 py-3 text-white"
      style={{ backgroundColor: cfg.textColor }}
    >
      <div className="flex items-center gap-1.5 text-label">
        <Icon aria-hidden="true" className="h-4 w-4" />
        คะแนน CPD
      </div>
      <div className="flex items-baseline gap-1.5 tabular-nums">
        <span className="text-kpi">{Number.isFinite(scoreNum) ? scoreNum.toFixed(scoreNum % 1 === 0 ? 0 : 2) : '—'}</span>
        <span className="text-label text-white/80">/ {CPD_MAX_SCORE}</span>
      </div>
      <div className="text-label font-semibold">{cfg.labelTh}</div>
    </div>
  );
}

export function PatientHeader({
  hn,
  an,
  name,
  age,
  admitDate,
  laborStatus,
  weightKg,
  weightDiffKg,
  hospital,
  cpdScore,
}: PatientHeaderProps) {
  const showWeight = weightKg != null && weightDiffKg != null && weightKg > 0 && weightDiffKg > 0;
  const preWeight = showWeight ? weightKg - weightDiffKg : null;
  const weightTone: WeightTone =
    weightDiffKg != null ? (WEIGHT_TONE_BY_POINTS[CPD_FACTOR_WEIGHTS.weightDiffKg.evaluate(weightDiffKg)] ?? 'ok') : 'ok';
  const active = laborStatus === 'ACTIVE';

  return (
    <div data-testid="patient-header" className="bg-brand-strong px-4 py-4 text-white md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="truncate text-page">{name ? maskName(name) : 'ไม่ทราบชื่อ'}</h1>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-label',
                active ? 'bg-ok-tint text-ok-text' : 'bg-white/10 text-white',
              )}
            >
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', active ? 'bg-ok' : 'bg-white/60')} />
              {active ? 'คลอดอยู่' : 'คลอดแล้ว'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Chip icon={<User className="h-3.5 w-3.5" />} label="AN" value={an} />
            <Chip icon={<User className="h-3.5 w-3.5" />} label="HN" value={hn} />
            <Chip icon={<Calendar className="h-3.5 w-3.5" />} label="อายุ" value={<><span>{age}</span> ปี</>} />
            <Chip icon={<Activity className="h-3.5 w-3.5" />} label="รับเข้า" value={formatThaiDate(new Date(admitDate))} />
            {showWeight && preWeight !== null && weightDiffKg !== null && (
              <Chip
                icon={<Scale className="h-3.5 w-3.5" />}
                label="น.น."
                value={
                  <>
                    <span>{preWeight}</span>
                    <span className="mx-1 text-white/60">→</span>
                    <span>{weightKg}</span>
                    <span className="mx-1 text-white/60">=</span>
                    <span data-tone={weightTone} className={WEIGHT_TEXT[weightTone]}>
                      +{weightDiffKg}
                    </span>
                    <span className="ml-1 text-white/70">กก.</span>
                  </>
                }
              />
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-label text-white">
              <Hospital aria-hidden="true" className="h-3.5 w-3.5 text-white/70" />
              <span className="font-semibold">{hospital.name}</span>
              <span className="text-white/70">·{hospital.level}</span>
            </span>
            {hospital.connectionStatus && (
              <span className="inline-flex items-center rounded-full bg-surface-card px-3 py-1">
                <ConnectionStatus status={hospital.connectionStatus} lastSyncAt={hospital.lastSyncAt ?? null} className="text-label" />
              </span>
            )}
          </div>
        </div>
        {cpdScore && <CpdTile score={cpdScore.score} riskLevel={cpdScore.riskLevel} />}
      </div>
    </div>
  );
}
