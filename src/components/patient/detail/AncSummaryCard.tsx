// src/components/patient/detail/AncSummaryCard.tsx
// ANC summary for a labour admission linked to a maternal journey. Risk via
// the shared AncRiskChip; visit and last-visit bands from ANC_SUMMARY_DISPLAY
// (values moved verbatim from the old page).
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { SectionCard } from '@/components/shared/SectionCard';
import { AncRiskChip } from '@/components/shared/AncRiskChip';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { ANC_RISK_LABEL_TH } from '@/config/anc-risk-display';
import { ANC_SUMMARY_DISPLAY, classifyAncVisitCount, type AncVisitBand } from '@/config/anc-ops';
import { CARE_STAGE_LABEL_TH } from '@/config/obstetric-display';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import type { PatientDetailResponse } from '@/types/api';
import { cn } from '@/lib/utils';
import { fmtDateTh } from './format';

type Journey = NonNullable<PatientDetailResponse['journeyContext']>;

const VISIT_BAND: Record<AncVisitBand, { tone: StatusTone; note: string }> = {
  belowMinimum: { tone: 'danger', note: 'ต่ำกว่ามาตรฐาน' },
  belowTarget: { tone: 'warn', note: 'ยังไม่ครบ' },
  met: { tone: 'ok', note: 'ครบตามเกณฑ์' },
};

function AncTile({ label, value, note, tone }: { label: string; value: ReactNode; note?: string; tone: StatusTone }) {
  const t = STATUS_TONE[tone];
  return (
    <div className={cn('min-w-0 rounded-xl border border-border border-l-4 bg-surface-card px-3 py-2', t.accent)}>
      <div className="text-label text-ink-muted">{label}</div>
      <div className={cn('whitespace-nowrap text-title tabular-nums', tone === 'neutral' ? 'text-ink' : t.text)}>{value}</div>
      {note && <div className="text-caption text-ink-muted">{note}</div>}
    </div>
  );
}

export function AncSummaryCard({ journey, now }: { journey: Journey; now: number }) {
  const level = journey.ancRiskLevel || 'LOW';
  const band = VISIT_BAND[classifyAncVisitCount(journey.ancVisitCount)];
  const daysSinceLastAnc = journey.lastAncDate
    ? Math.floor((now - new Date(journey.lastAncDate).getTime()) / 86_400_000)
    : null;
  const lastVisitLate = daysSinceLastAnc != null && daysSinceLastAnc > ANC_SUMMARY_DISPLAY.lastVisitAlertDays;
  return (
    <SectionCard
      title="ข้อมูลฝากครรภ์ (ANC)"
      description="สรุปจากทะเบียนฝากครรภ์ที่ผูกกับการคลอดครั้งนี้ — ประวัติฝากครรภ์ทั้งหมดอยู่ในหน้าการฝากครรภ์"
      actions={
        <Link
          href={`/pregnancies/${journey.journeyId}`}
          className="inline-flex h-10 items-center rounded-lg bg-brand px-3 text-label text-white hover:bg-brand-strong"
        >
          ดูรายละเอียดการฝากครรภ์ →
        </Link>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <AncRiskChip level={level} />
        <span className="text-label text-ink">{ANC_RISK_LABEL_TH[level] ?? level}</span>
        <span className="rounded-full border border-border px-3 py-0.5 text-label text-ink-muted">
          ระยะการดูแล: {CARE_STAGE_LABEL_TH[journey.careStage] ?? journey.careStage}
        </span>
      </div>
      <KpiGrid min="md">
        <AncTile
          label="จำนวนครั้ง ANC"
          tone={band.tone}
          note={band.note}
          value={
            <>
              {journey.ancVisitCount}
              <span className="ml-1 text-label text-ink-muted">/ {ANC_SUMMARY_DISPLAY.visitsTarget}</span>
            </>
          }
        />
        <AncTile
          label="ANC ครั้งสุดท้าย"
          value={fmtDateTh(journey.lastAncDate)}
          note={daysSinceLastAnc != null ? `${daysSinceLastAnc} วันที่แล้ว` : undefined}
          tone={lastVisitLate ? 'danger' : 'neutral'}
        />
        <AncTile label="วันแรกของประจำเดือนครั้งสุดท้าย (LMP)" value={fmtDateTh(journey.lmp)} tone="neutral" />
        <AncTile label="กำหนดคลอด (EDC)" value={fmtDateTh(journey.edc)} tone="neutral" />
      </KpiGrid>
    </SectionCard>
  );
}

