// Kiosk-only since UI sub-project 2; normal mode renders province/AlertsSection.
// AlertBar — persistent ribbon with "ALL CLEAR" resting state. Recalibrated
// 2026-07-09: every tile is a number that can actually move, computed from
// the same configs the drill-down boards use (see dashboard.ts:
// getDashboardAlerts), and every tile links to its pre-filtered board.
// The old ribbon showed "all pending referrals" (permanently ~125), an
// ungated 28-day ANC rule (817 vs the boards' 138), and an eternally-zero
// in-transit count — alarms that never move teach users to stop looking.
'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { DashboardAlerts } from '@/types/api';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ALERT_DEFINITIONS, alarmTotal } from '@/components/dashboard/province/alert-definitions';

interface AlertBarProps {
  alerts: DashboardAlerts;
}

interface AlertTileProps {
  testId: string;
  href: string;
  label: string;
  value: number;
  zeroLabel: string;
  detail: string;
  tooltipTitle: string;
  tooltipBody: ReactNode;
  /** Color when value > 0 — red for alarms, amber for workload. */
  hotColor?: string;
}

function AlertTile({
  testId,
  href,
  label,
  value,
  zeroLabel,
  detail,
  tooltipTitle,
  tooltipBody,
  hotColor = 'var(--risk-high)',
}: AlertTileProps) {
  const hot = value > 0;
  const color = hot ? hotColor : 'var(--risk-low)';
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            data-testid={testId}
            aria-label={`${label}: ${value}. ${tooltipTitle}`}
            className="flex flex-1 items-center gap-3.5 border-r border-[var(--rule-strong)] px-4 py-2.5 outline-none transition-colors hover:bg-[var(--accent-navy-soft)] focus-visible:bg-[var(--accent-navy-soft)]"
          />
        }
      >
        <div style={{ width: 3, height: 28, background: color }} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-muted)]">
            {label}
          </div>
          <div
            className={cn(
              'font-mono text-sm',
              hot ? 'text-[var(--ink-navy)]' : 'text-[var(--ink-navy-dim)]',
            )}
          >
            {hot ? detail : zeroLabel}
          </div>
        </div>
        <div
          className="font-mono text-kpi font-semibold leading-none tabular-nums"
          style={{ color, letterSpacing: '-0.02em' }}
        >
          {value}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm whitespace-normal text-left leading-snug">
        <div className="space-y-1">
          <div className="font-mono text-caption uppercase tracking-[0.14em] opacity-70">
            {label}
          </div>
          <div className="text-sm font-semibold">{tooltipTitle}</div>
          <div className="text-caption opacity-90">{tooltipBody}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function AlertBar({ alerts }: AlertBarProps) {
  // Only true alarms feed the leading total — due-soon is upcoming workload,
  // not an incident, so it must not push the ribbon into red on its own.
  const total = alarmTotal(alerts);
  const hot = total > 0;
  const stateColor = hot ? 'var(--risk-high)' : 'var(--risk-low)';

  return (
    <div
      className={cn(
        'flex items-stretch border-b border-[var(--rule-strong)]',
        hot ? 'bg-gradient-to-r from-danger-tint to-surface-card' : 'bg-white',
      )}
    >
      {/* Leading state label — total across the two alarm categories. */}
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              tabIndex={0}
              aria-label={`${hot ? 'ACTIVE ALERTS' : 'ALL CLEAR'}: ${total}`}
              className="flex min-w-[200px] cursor-help items-center gap-2 border-r border-[var(--rule-strong)] px-5 py-2.5 outline-none focus-visible:bg-[var(--accent-navy-soft)]"
            />
          }
        >
          <span
            style={{ background: stateColor }}
            className={cn('h-1.5 w-1.5 rounded-full', hot && 'animate-pulse-hi')}
            aria-hidden="true"
          />
          <span className="font-mono text-caption uppercase tracking-[0.14em] text-[var(--ink-navy-dim)]">
            {hot ? 'ACTIVE ALERTS' : 'ALL CLEAR'}
          </span>
          <span
            className="ml-auto font-mono text-title font-semibold tabular-nums"
            style={{ color: stateColor }}
          >
            {total}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-sm whitespace-normal text-left leading-snug">
          <div className="space-y-1">
            <div className="text-sm font-semibold">
              {hot ? 'สถานะรวม — มีงานค้างต้องจัดการ' : 'สถานะรวม — ปลอดเหตุการณ์'}
            </div>
            <div className="text-caption opacity-90">
              ผลรวมของ REFERRAL ACTION (ส่งต่อเกิน SLA/ฉุกเฉินค้าง) + OVERDUE ANC (ขาดนัดเกิน 35
              วัน). DUE ≤14D เป็นภาระงานล่วงหน้า ไม่นับรวมในสัญญาณเตือน.
              คลิกแต่ละช่องเพื่อเปิดหน้ารายการที่กรองไว้แล้ว.
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
      {ALERT_DEFINITIONS.map((d) => (
        <AlertTile
          key={d.key}
          testId={d.testId}
          href={d.href}
          label={d.kioskLabel}
          value={alerts[d.key]}
          zeroLabel={d.zeroLabel}
          detail={d.kioskDetail}
          tooltipTitle={d.tooltipTitle}
          tooltipBody={d.tooltipBody}
          hotColor={d.kind === 'workload' ? 'var(--risk-medium)' : undefined}
        />
      ))}
    </div>
  );
}
