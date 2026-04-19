// AlertSummaryPanel — surfaces partograph CDSS alerts grouped by severity.
'use client';

import type { CdssAlertDto, PartographObservationDto } from '@/types/api';
import {
  SEVERITY_DOT,
  SEVERITY_LABEL_TH,
  SECTION_LABEL_TH,
  SEVERITY_DISPLAY_ORDER,
} from './cdss-presentation';
import { cn } from '@/lib/utils';

interface AlertSummaryPanelProps {
  alerts: CdssAlertDto[];
  observations: PartographObservationDto[];
}

export function AlertSummaryPanel({ alerts, observations }: AlertSummaryPanelProps) {
  if (alerts.length === 0) return null;

  // Group alerts by severity (preserve display order, then sort items within
  // each group by descending obsIndex so the most-recent observations appear first).
  const grouped = SEVERITY_DISPLAY_ORDER
    .map((severity) => ({
      severity,
      items: alerts
        .filter((a) => a.severity === severity)
        .sort((a, b) => b.obsIndex - a.obsIndex),
    }))
    .filter((group) => group.items.length > 0);

  function timeLabel(obsIndex: number): string {
    if (obsIndex < 0) return 'ภาพรวม';
    const obs = observations[obsIndex];
    if (!obs) return '';
    return new Date(obs.observeDatetime).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div
      data-testid="alert-summary-panel"
      className="rounded-2xl border-l-4 border-l-orange-400 bg-orange-50/40 p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
    >
      <div className="space-y-3">
        {grouped.map((group) => (
          <div
            key={group.severity}
            data-testid={`alert-group-${group.severity.toLowerCase()}`}
          >
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <span
                className={cn(
                  'inline-block h-2.5 w-2.5 rounded-full',
                  SEVERITY_DOT[group.severity],
                )}
                aria-hidden="true"
              />
              <span>
                {SEVERITY_LABEL_TH[group.severity]} {group.items.length} ครั้ง
              </span>
            </div>
            <ul className="ml-4 space-y-0.5">
              {group.items.map((alert, i) => (
                <li
                  key={`${alert.section}-${alert.obsIndex}-${i}`}
                  className="text-sm text-slate-700"
                >
                  <span>• {alert.message}</span>{' '}
                  <span className="text-xs text-slate-500">
                    ({SECTION_LABEL_TH[alert.section]}, {timeLabel(alert.obsIndex)})
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
