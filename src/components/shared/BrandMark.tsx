// src/components/shared/BrandMark.tsx
// The round "K" mark: sidebar, login and about all draw it. Decorative — the
// surrounding link or heading carries the accessible name.
import { cn } from '@/lib/utils';

const TONE = { onLight: 'bg-brand text-white', onBrand: 'bg-white text-brand' } as const;
const SIZE = { sm: 'h-8 w-8', md: 'h-10 w-10 text-body-lg' } as const;

export function BrandMark({
  tone = 'onLight',
  size = 'md',
  className,
}: {
  tone?: keyof typeof TONE;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={cn('grid shrink-0 place-items-center rounded-full font-bold', SIZE[size], TONE[tone], className)}>
      K
    </span>
  );
}
