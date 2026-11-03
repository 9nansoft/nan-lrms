// T010: StickyPatientHeader — compact bar once the main header scrolls out of view
'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CpdBadge } from '@/components/shared/CpdBadge';
import type { RiskLevel } from '@/types/domain';

interface StickyPatientHeaderProps {
  name: string;
  hn: string;
  an: string;
  laborStatus: string;
  hospitalName: string;
  cpdScore?: {
    score: number;
    riskLevel: RiskLevel;
  } | null;
  mainHeaderRef: React.RefObject<HTMLDivElement | null>;
}

const LABOR_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'คลอดอยู่',
  DELIVERED: 'คลอดแล้ว',
  TRANSFERRED: 'ส่งต่อแล้ว',
};

export function StickyPatientHeader({
  name,
  hn,
  an,
  laborStatus,
  hospitalName,
  cpdScore,
  mainHeaderRef,
}: StickyPatientHeaderProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const headerEl = mainHeaderRef.current;
    if (!headerEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Show sticky header when main header is NOT intersecting (scrolled away)
        setIsVisible(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(headerEl);

    return () => {
      observer.disconnect();
    };
  }, [mainHeaderRef]);

  const laborLabel = LABOR_STATUS_LABELS[laborStatus] ?? laborStatus;

  // B2: a zero-height sticky anchor inside the content column. It always sits
  // under the shell header (--app-header-h, published by AppHeader) and never
  // shifts layout when the bar appears, which would re-trigger the observer.
  // A div, not header.sticky, so kiosk CSS never targets it.
  return (
    <div className="sticky top-[var(--app-header-h,0px)] z-30 h-0 print:hidden">
      {isVisible && (
        <div
          role="region"
          aria-label="แถบข้อมูลผู้คลอดย่อ"
          className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-border bg-surface-card/95 px-4 py-2 shadow-soft backdrop-blur-md md:px-6"
        >
          <span className="truncate text-body font-semibold text-ink">AN {an}</span>
          <span className="shrink-0 text-label text-ink-muted">HN {hn}</span>
          <Badge variant={laborStatus === 'ACTIVE' ? 'default' : 'secondary'}>{laborLabel}</Badge>
          <Badge variant="outline" className="shrink-0">
            {hospitalName}
          </Badge>
          {cpdScore && <CpdBadge score={cpdScore.score} riskLevel={cpdScore.riskLevel} size="sm" />}
        </div>
      )}
    </div>
  );
}
