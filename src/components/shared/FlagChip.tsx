// FlagChip — small clinical flag chip (LBW, เกินกำหนด, HR3, อายุ < 20 …).
// `tone` renders token text on a token tint (AA, foundation deviation 5).
// `color` is the legacy marker-colour mode. Remaining consumers: the journey
// detail page flag rows (/pregnancies/[journeyId]), NewbornOutcomesCard and
// ReferralHistoryCard (patient detail). Do not use it in new code.
import type { ReactNode } from 'react';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import { cn } from '@/lib/utils';

export type FlagTone = StatusTone;

// brand keeps the stronger text shade on the soft tint (AA) — the one place
// this chip deliberately differs from STATUS_TONE.chip.
const TONE: Record<FlagTone, string> = {
  danger: STATUS_TONE.danger.chip,
  warn: STATUS_TONE.warn.chip,
  ok: STATUS_TONE.ok.chip,
  brand: `${STATUS_TONE.brand.border} ${STATUS_TONE.brand.tint} text-brand-strong`,
  neutral: STATUS_TONE.neutral.chip,
};

export function FlagChip({
  tone,
  color,
  title,
  children,
}: {
  tone?: FlagTone;
  /** @deprecated legacy marker colour — use `tone`. */
  color?: string;
  title?: string;
  children: ReactNode;
}) {
  if (tone || !color) {
    return (
      <span
        title={title}
        className={cn('inline-block rounded-md border px-1.5 py-px text-caption font-semibold', TONE[tone ?? 'neutral'])}
      >
        {children}
      </span>
    );
  }
  return (
    <span
      title={title}
      className="inline-block border px-1 py-px font-mono text-caption font-semibold tracking-[0.04em]"
      style={{ color, borderColor: color, background: 'transparent' }}
    >
      {children}
    </span>
  );
}
