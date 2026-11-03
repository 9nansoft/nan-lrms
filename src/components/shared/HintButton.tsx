// The one "what does this number mean?" affordance: an info button whose
// tooltip (KpiTip) explains, in Thai, exactly what is counted. It is a real
// <button>, so it must never sit inside a link — KpiTile renders it beside
// its stretched link.
'use client';

import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { KpiTip } from '@/components/shared/KpiTip';
import { cn } from '@/lib/utils';

export interface HintButtonProps {
  /** What the hint explains; the button is named "คำอธิบาย: {label}". */
  label: string;
  title: string;
  body: ReactNode;
  className?: string;
}

export function HintButton({ label, title, body, className }: HintButtonProps) {
  return (
    <KpiTip
      title={title}
      body={body}
      trigger={
        <button
          type="button"
          aria-label={`คำอธิบาย: ${label}`}
          className={cn(
            'relative z-10 -m-1 shrink-0 cursor-help rounded-full p-1 opacity-80 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand',
            className,
          )}
        />
      }
    >
      <Info aria-hidden="true" className="h-4 w-4" />
    </KpiTip>
  );
}
