// src/components/maternity/ward/WardKpis.tsx
// The ward summary: a bed-capacity panel and an "assess now" panel, side by
// side when the summary is wide and stacked when narrow (container query).
// Every number comes from summarizeBeds (the complete HOSxP ward roster, spec
// D8), never from an inline count; copy and the prolonged-latent rule line
// come from src/config/ward-display.ts.
'use client';

import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { HintButton } from '@/components/shared/HintButton';
import { SectionCard } from '@/components/shared/SectionCard';
import {
  CAPACITY_SEGMENTS,
  PROLONGED_LATENT_HINT,
  PROLONGED_LATENT_RULE_TH,
  capacityAriaLabel,
  capacityBeds,
  capacityFooterNotes,
  type CapacitySegment,
} from '@/config/ward-display';
import { revealFirstBedTile } from '@/lib/reveal-bed-tile';
import { cn } from '@/lib/utils';
import type { BedSummary } from '@/services/ward-board';

const LEGEND_TEST_ID: Record<CapacitySegment, string> = {
  occupied: 'ward-kpi-occupied',
  free: 'ward-kpi-free',
  locked: 'ward-kpi-locked',
};

/** One legend entry: swatch + label, the number, its unit, an optional note. */
function LegendItem({
  testId,
  swatch,
  label,
  count,
  unit,
  note,
}: {
  testId: string;
  swatch: string;
  label: string;
  count: number;
  unit: string;
  note?: string;
}) {
  return (
    <div data-testid={testId} className="min-w-0">
      <div className="flex items-center gap-2 text-label text-ink-muted">
        <span aria-hidden="true" className={cn('h-3 w-3 shrink-0 rounded-sm', swatch)} />
        <span>{label}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span data-kpi-value className="text-kpi-sm tabular-nums text-ink">
          {count}
        </span>
        <span className="text-label text-ink-muted">{unit}</span>
      </div>
      {note && <div className="text-caption text-ink-muted">{note}</div>}
    </div>
  );
}

function CapacityPanel({ summary }: { summary: BedSummary }) {
  const beds = capacityBeds(summary);
  const notes = capacityFooterNotes(summary);
  return (
    <SectionCard
      title="ความจุเตียง"
      className="flex min-w-0 flex-col"
      actions={
        summary.occupancyPct !== null && (
          <span className="rounded-full bg-brand-soft px-3 py-1 text-label tabular-nums text-brand-strong">
            ใช้เตียง {summary.occupancyPct}%
          </span>
        )
      }
    >
      <div
        role="img"
        aria-label={capacityAriaLabel(summary)}
        className="flex h-3 w-full gap-1 overflow-hidden rounded-full bg-surface-muted"
      >
        {CAPACITY_SEGMENTS.filter((seg) => beds[seg.key] > 0).map((seg) => (
          <div
            key={seg.key}
            data-segment={seg.key}
            className={cn('h-full basis-0 rounded-full', seg.className)}
            style={{ flexGrow: beds[seg.key] }}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {CAPACITY_SEGMENTS.map((seg) =>
          seg.key === 'occupied' ? (
            // "มีผู้คลอด" is patients (I2: unplaced and shared-bed patients
            // included); the bar segment is beds, so name the bed count when
            // the two differ.
            <LegendItem
              key={seg.key}
              testId={LEGEND_TEST_ID[seg.key]}
              swatch={seg.className}
              label={seg.labelTh}
              count={summary.patients}
              unit="ราย"
              note={summary.patients !== summary.occupied ? `ใช้ ${summary.occupied} เตียง` : undefined}
            />
          ) : (
            <LegendItem
              key={seg.key}
              testId={LEGEND_TEST_ID[seg.key]}
              swatch={seg.className}
              label={seg.labelTh}
              count={beds[seg.key]}
              unit="เตียง"
              note={seg.key === 'locked' ? 'ล็อกใน HOSxP' : undefined}
            />
          ),
        )}
      </div>

      <p className="mt-auto flex flex-wrap gap-x-2 gap-y-1 border-t border-border pt-3 text-label text-ink-muted">
        <span data-testid="ward-kpi-total">
          <span>เตียงทั้งหมด</span>{' '}
          <b data-kpi-value className="tabular-nums text-ink">
            {summary.totalBeds}
          </b>
        </span>
        {notes.map((n) => (
          <span key={n} className="font-semibold text-warn-text">
            <span aria-hidden="true" className="mr-2 font-normal text-ink-muted">
              ·
            </span>
            {n}
          </span>
        ))}
      </p>
    </SectionCard>
  );
}

function UrgentPanel({ count }: { count: number }) {
  const urgent = count > 0;
  return (
    <SectionCard
      title="ต้องประเมินด่วน"
      testId="ward-kpi-prolonged-latent"
      tone={urgent ? 'danger' : 'ok'}
      className={cn('flex min-w-0 flex-col', urgent && 'border-l-4 border-l-danger')}
      actions={
        <HintButton
          label={PROLONGED_LATENT_HINT.title}
          title={PROLONGED_LATENT_HINT.title}
          body={PROLONGED_LATENT_HINT.body}
          className="text-ink-muted"
        />
      }
    >
      {urgent ? (
        <>
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-danger-text" />
            <div className="min-w-0">
              <p className="text-body-lg text-danger-text">ระยะแฝงนาน</p>
              <p className="flex items-baseline gap-1">
                <span data-kpi-value className="text-kpi tabular-nums text-danger-text">
                  {count}
                </span>
                <span className="text-body-lg text-danger-text">ราย</span>
              </p>
              <p className="text-caption text-ink-muted">{PROLONGED_LATENT_RULE_TH}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => revealFirstBedTile('prolongedLatent')}
            className="mt-4 inline-flex h-10 items-center gap-2 self-start rounded-lg border border-danger/40 bg-surface-card px-4 text-label text-danger-text hover:bg-danger-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
          >
            ดูเตียง
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </>
      ) : (
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-ok-text" />
          <div className="min-w-0">
            <p className="text-body-lg text-ok-text">ไม่มีผู้คลอดระยะแฝงนาน</p>
            <p className="text-caption text-ink-muted">เกณฑ์: {PROLONGED_LATENT_RULE_TH}</p>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function WardKpis({ summary }: { summary: BedSummary }) {
  return (
    <section aria-label="สรุปเตียงในห้องคลอด" className="@container">
      <div className="grid gap-4 @xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <CapacityPanel summary={summary} />
        <UrgentPanel count={summary.prolongedLatent} />
      </div>
    </section>
  );
}
