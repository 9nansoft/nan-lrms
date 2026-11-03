// The one risk visual. Every risk chip/dot in the app renders through this so
// colour, size and accessible naming cannot drift between screens.
import type { HTMLAttributes, ReactNode } from 'react';
import { RISK_LEVELS } from '@/config/risk-levels';
import type { RiskLevel } from '@/types/domain';
import { cn } from '@/lib/utils';

export type RiskChipProps = {
  level: RiskLevel;
  score?: number;
  /** Accessible/visible Thai label override (defaults to the level's labelTh). */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'chip' | 'dot';
  pulse?: boolean;
  className?: string;
  title?: string;
  /** Visible content override (e.g. "HR3"); accessible name stays Thai. */
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'title' | 'className'>;

const SIZE: Record<NonNullable<RiskChipProps['size']>, string> = {
  sm: 'px-2 py-0.5 text-caption min-w-8',
  md: 'px-3 py-1 text-label min-w-10',
  lg: 'px-4 py-2 text-title min-w-14',
};

export function RiskChip({
  level,
  score,
  label,
  size = 'md',
  variant = 'chip',
  pulse = false,
  className,
  title,
  children,
  ...rest
}: RiskChipProps) {
  const cfg = RISK_LEVELS[level];
  const name = label ?? cfg.labelTh;
  const accessibleName = score === undefined ? name : `${name} คะแนน ${score.toFixed(1)}`;

  if (variant === 'dot') {
    return (
      <span
        {...rest}
        aria-label={accessibleName}
        title={title}
        className={cn('inline-flex items-center gap-1.5 text-label', className)}
      >
        <span
          aria-hidden="true"
          className={cn('h-2.5 w-2.5 rounded-full', pulse && 'animate-pulse')}
          style={{ backgroundColor: cfg.color }}
        />
        <span style={{ color: cfg.textColor }}>{children ?? name}</span>
      </span>
    );
  }

  return (
    <span
      {...rest}
      role="status"
      aria-label={accessibleName}
      title={title}
      className={cn(
        'inline-flex items-center justify-center gap-1 rounded-full font-semibold tabular-nums',
        SIZE[size],
        className,
      )}
      style={{ backgroundColor: cfg.bgColor, color: cfg.textColor }}
    >
      {children ?? (score !== undefined ? score.toFixed(1) : name)}
    </span>
  );
}
