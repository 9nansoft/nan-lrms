// src/components/shared/DismissibleAlert.tsx
// Dismissible, actionable alert: what happened (title), the raw detail for
// IT, and what to do ("วิธีแก้"). Shared by the webhook-provisioning alert
// and the bed-move errors (spec D11).
'use client';

import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DismissibleAlertProps {
  title: string;
  detail?: string | null;
  remedy?: string;
  tone?: 'danger' | 'warn';
  onDismiss: () => void;
  className?: string;
}

export function DismissibleAlert({ title, detail, remedy, tone = 'danger', onDismiss, className }: DismissibleAlertProps) {
  const danger = tone === 'danger';
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 text-body text-ink',
        danger ? 'border-danger/40 bg-danger-tint' : 'border-warn/40 bg-warn-tint',
        className,
      )}
    >
      <AlertTriangle aria-hidden="true" className={cn('mt-0.5 h-5 w-5 shrink-0', danger ? 'text-danger' : 'text-warn')} />
      <div className="min-w-0 flex-1">
        <p className={cn('font-semibold', danger ? 'text-danger-text' : 'text-warn-text')}>{title}</p>
        {detail && <p className="break-words text-caption text-ink-muted">{detail}</p>}
        {remedy && <p className="text-caption text-ink-muted">วิธีแก้: {remedy}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg border border-border bg-surface-card px-3 py-1 text-label text-ink-muted hover:bg-brand-soft"
      >
        ซ่อน
      </button>
    </div>
  );
}
