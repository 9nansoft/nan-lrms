import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SectionTone = 'default' | 'ok' | 'warn' | 'danger';

const TONE: Record<SectionTone, string> = {
  default: 'bg-surface-card',
  ok: 'bg-ok-tint border border-ok/40',
  warn: 'bg-warn-tint border border-warn/40',
  danger: 'bg-danger-tint border border-danger/40',
};

export interface SectionCardProps {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: SectionTone;
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function SectionCard({
  id,
  title,
  description,
  actions,
  tone = 'default',
  className,
  testId,
  children,
}: SectionCardProps) {
  return (
    <section
      id={id}
      aria-label={title}
      data-testid={testId}
      data-tone={tone}
      className={cn('rounded-2xl p-5 shadow-soft', id && 'scroll-mt-6', TONE[tone], className)}
    >
      <header className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-title text-brand">{title}</h2>
          {description && <p className="text-caption text-ink-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
