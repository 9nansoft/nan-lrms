// src/components/shared/InlineNotice.tsx
// Success / info line for in-place admin and profile actions. Failures use
// ErrorState variant="banner" (role="alert", "วิธีแก้: …"), never this.
import type { ReactNode } from 'react';
import { CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const TONE = {
  ok: { box: 'border-ok/40 bg-ok-tint text-ok-text', Icon: CheckCircle2 },
  info: { box: 'border-brand/30 bg-brand-soft text-brand', Icon: Info },
} as const;

export function InlineNotice({
  tone = 'ok',
  children,
  className,
}: {
  tone?: keyof typeof TONE;
  children: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONE[tone];
  return (
    <p role="status" className={cn('flex items-start gap-2 rounded-xl border px-3 py-2 text-body', box, className)}>
      <Icon aria-hidden="true" className="mt-1 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
