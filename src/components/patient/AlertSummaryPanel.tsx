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

  function timeLabel(obsIndex: number): string {
    if (obsIndex < 0) return 'ภาพรวม';
    const obs = observations[obsIndex];
    if (!obs) return '';
    return new Date(obs.observeDatetime).toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Group alerts by severity (preserve display order). Within each group,
  // collapse duplicates keyed by (section, message, timeLabel) so the same
  // finding reported against the same observation — or against two obs at
  // the same HH:mm — doesn't render as two identical list items. The group
  // header still shows the raw occurrence count so the user sees fidelity
  // ("วิกฤต 5 ครั้ง") separately from the uniquified list below.
  interface UniqueItem { alert: CdssAlertDto; count: number; time: string }
  const grouped = SEVERITY_DISPLAY_ORDER
    .map((severity) => {
      const group = alerts.filter((a) => a.severity === severity);
      const bucket = new Map<string, UniqueItem>();
      for (const a of group) {
        const time = timeLabel(a.obsIndex);
        const key = `${a.section}|${a.message}|${time}`;
        const hit = bucket.get(key);
        if (hit) hit.count += 1;
        else bucket.set(key, { alert: a, count: 1, time });
      }
      // Most-recent observations first.
      const unique = [...bucket.values()].sort(
        (a, b) => b.alert.obsIndex - a.alert.obsIndex,
      );
      return { severity, rawCount: group.length, items: unique };
    })
    .filter((group) => group.items.length > 0);

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
                {SEVERITY_LABEL_TH[group.severity]} {group.rawCount} ครั้ง
              </span>
            </div>
            <ul className="ml-4 space-y-0.5">
              {group.items.map((item, i) => (
                <li
                  key={`${item.alert.section}-${item.alert.obsIndex}-${i}`}
                  className="text-sm text-slate-700"
                >
                  <span>• {item.alert.message}</span>{' '}
                  <span className="text-xs text-slate-500">
                    ({SECTION_LABEL_TH[item.alert.section]}, {item.time})
                  </span>
                  {item.count > 1 && (
                    <span className="ml-1 rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                      ×{item.count}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
