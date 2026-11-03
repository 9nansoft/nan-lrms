import Image from 'next/image';
import type { ReactNode } from 'react';
import { Ambulance, BedDouble, CloudOff, Inbox, type LucideIcon } from 'lucide-react';
import { ILLUSTRATION_SRC, illustrationsEnabled, type IllustrationName } from '@/config/illustrations';
import { cn } from '@/lib/utils';

const ICON: Record<IllustrationName, LucideIcon> = {
  ward: BedDouble,
  referral: Ambulance,
  stale: CloudOff,
  generic: Inbox,
};

export interface EmptyStateProps {
  illustration?: IllustrationName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  tone?: 'default' | 'warn';
  className?: string;
}

export function EmptyState({
  illustration = 'generic',
  title,
  description,
  action,
  tone = 'default',
  className,
}: EmptyStateProps) {
  const Icon = ICON[illustration];
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl px-6 py-8 text-center',
        tone === 'warn' ? 'border border-warn/40 bg-warn-tint' : 'bg-surface-card shadow-soft',
        className,
      )}
    >
      {illustrationsEnabled() ? (
        <Image src={ILLUSTRATION_SRC[illustration]} alt="" width={260} height={195} className="h-auto w-[min(260px,62%)]" />
      ) : (
        <Icon aria-hidden="true" className={cn('h-12 w-12', tone === 'warn' ? 'text-warn-text' : 'text-brand')} />
      )}
      <h3 className={cn('text-title', tone === 'warn' ? 'text-warn-text' : 'text-brand')}>{title}</h3>
      {description && <div className="max-w-prose text-body text-ink-muted">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
