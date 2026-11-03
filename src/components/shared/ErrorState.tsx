// ErrorState — actionable fetch-failure UI (Constitution V: error messages in
// Thai, say what went wrong AND what to do). Two variants:
//   'page'   — full-panel replacement when there is no data to show
//   'banner' — slim strip above stale cached data that is still on screen
'use client';

import { cn } from '@/lib/utils';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  /** Technical detail (e.g. FetchError message from the API error body). */
  detail?: string;
  /** Renders a "ลองใหม่" button when provided. */
  onRetry?: () => void;
  variant?: 'page' | 'banner';
  /** banner variant: timestamp of the cached data still being displayed. */
  lastUpdatedAt?: string | null;
  /** What the user should do next; rendered as "วิธีแก้: …". */
  remedy?: string;
  className?: string;
}

function formatBangkokTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function ErrorState({
  message = 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่',
  detail,
  onRetry,
  variant = 'page',
  lastUpdatedAt,
  remedy,
  className,
}: ErrorStateProps) {
  if (variant === 'banner') {
    return (
      <div
        role="alert"
        className={cn(
          'flex flex-wrap items-center gap-3 border-b border-warn/40 bg-warn-tint px-5 py-2 text-caption text-ink',
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
        <span className="font-semibold">{message}</span>
        {lastUpdatedAt && (
          <span className="text-ink-muted">
            แสดงข้อมูลล่าสุดเมื่อ{' '}
            <span className="font-semibold tabular-nums">{formatBangkokTime(lastUpdatedAt)}</span>
          </span>
        )}
        {remedy && <span className="text-ink-muted">วิธีแก้: {remedy}</span>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-sm border border-border bg-white px-2 py-0.5 text-ink-muted transition-colors hover:bg-brand-soft"
          >
            <RefreshCw className="h-3 w-3" />
            ลองใหม่
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-3 py-16 text-center text-ink-muted', className)}
    >
      <AlertTriangle className="h-8 w-8 text-danger" />
      <p className="text-body text-danger-text font-semibold">{message}</p>
      {detail && <p className="max-w-md text-caption">{detail}</p>}
      {remedy && <p className="text-body text-ink-muted">วิธีแก้: {remedy}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-sm border border-border bg-white px-3 py-1.5 text-caption text-ink-muted transition-colors hover:bg-brand-soft"
        >
          <RefreshCw className="h-3 w-3" />
          ลองใหม่
        </button>
      )}
    </div>
  );
}
