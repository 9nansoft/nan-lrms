// ภาพรวมโรงพยาบาล — the province map + hospital list. Rendered ONCE (the old
// page mounted two Leaflet maps: a desktop aside and a hidden mobile copy).
// When the page container is ≥ 1160px it is the sticky right column, offset
// by the shell header height (--app-header-h, published by AppHeader); below
// that it stacks after the sections with a 360px map. In the sticky column
// the map / list split is user-adjustable via a draggable divider
// (useMapShare, persisted to localStorage).
'use client';

import {
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Expand } from 'lucide-react';
import { useMapShare, MAP_SHARE_MIN, MAP_SHARE_MAX } from '@/hooks/useMapShare';
import type { DashboardHospital } from '@/types/api';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { HospitalTable } from '@/components/dashboard/HospitalTable';
import { cn } from '@/lib/utils';
import { OverviewModeToggle, type OverviewMode } from './OverviewModeToggle';

export interface ProvinceOverviewPanelProps {
  hospitals: DashboardHospital[];
  onlineCount: number;
  selected: string | null;
  onSelect: (hcode: string | null) => void;
  mode: OverviewMode;
  onModeChange: (mode: OverviewMode) => void;
  onExpand: () => void;
}

const STICKY =
  '@min-[1160px]:sticky @min-[1160px]:top-[calc(var(--app-header-h,0px)_+_16px)] @min-[1160px]:h-[calc(100dvh_-_var(--app-header-h,0px)_-_32px)]';

export function ProvinceOverviewPanel({
  hospitals,
  onlineCount,
  selected,
  onSelect,
  mode,
  onModeChange,
  onExpand,
}: ProvinceOverviewPanelProps) {
  // Draggable map / hospital-list split (sticky column only). Starts at the
  // persisted value (or 40%) and clamps to [15%, 85%]. The persisted value
  // arrives via useSyncExternalStore right after hydration, so SSR never sees
  // localStorage and no mount effect is needed.
  const { mapShare, previewMapShare, saveMapShare, commitMapShare } = useMapShare();
  const sectionRef = useRef<HTMLElement | null>(null);
  const dragStart = useRef<{ y: number; share: number } | null>(null);
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = { y: e.clientY, share: mapShare };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStart.current;
    const col = sectionRef.current;
    if (!drag || !col) return;
    const height = col.getBoundingClientRect().height;
    if (height <= 0) return;
    const next = drag.share + ((e.clientY - drag.y) / height) * 100;
    previewMapShare(Math.min(MAP_SHARE_MAX, Math.max(MAP_SHARE_MIN, next)));
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // capture already released (e.g. on pointercancel)
    }
    saveMapShare();
  };
  const onDividerKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    // ArrowDown grows the map (the divider moves down), ArrowUp shrinks it.
    const delta =
      e.key === 'ArrowDown' || e.key === 'PageDown'
        ? 1
        : e.key === 'ArrowUp' || e.key === 'PageUp'
          ? -1
          : 0;
    if (delta === 0) return;
    e.preventDefault();
    const step = e.key.startsWith('Page') ? 10 : 1;
    commitMapShare(Math.min(MAP_SHARE_MAX, Math.max(MAP_SHARE_MIN, mapShare + delta * step)));
  };

  return (
    <section
      ref={sectionRef}
      style={{ '--map-share': `${mapShare}%` } as CSSProperties}
      aria-label="ภาพรวมโรงพยาบาล"
      data-testid="province-overview"
      className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl bg-surface-card shadow-soft', STICKY)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-title text-brand">ภาพรวมโรงพยาบาล</h2>
          <p className="text-caption text-ink-muted">
            เชื่อมต่ออยู่{' '}
            <span className="tabular-nums">
              {onlineCount}/{hospitals.length}
            </span>{' '}
            แห่ง
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <OverviewModeToggle mode={mode} onChange={onModeChange} />
          <button
            type="button"
            onClick={onExpand}
            aria-label="ขยายแผนที่เต็มจอ"
            title="ขยายเต็มจอ"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-label text-brand hover:bg-brand-soft"
          >
            <Expand aria-hidden="true" className="h-4 w-4" />
            ขยาย
          </button>
        </div>
      </header>
      {mode === 'map' ? (
        <>
          <div className="h-[360px] min-h-0 @min-[1160px]:h-auto @min-[1160px]:shrink-0 @min-[1160px]:grow-0 @min-[1160px]:basis-[var(--map-share)]">
            <ProvinceMap hospitals={hospitals} selected={selected} onSelect={onSelect} size="full" />
          </div>
          {/* Draggable divider — pointer-drag (or ArrowUp/ArrowDown) resizes
              the map / list split; persisted to localStorage. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-valuemin={MAP_SHARE_MIN}
            aria-valuemax={MAP_SHARE_MAX}
            aria-valuenow={Math.round(mapShare)}
            aria-label="ปรับสัดส่วนแผนที่ / รายชื่อโรงพยาบาล"
            tabIndex={0}
            title="ลากเพื่อปรับสัดส่วนแผนที่ / รายชื่อ"
            data-testid="overview-split-divider"
            className="group hidden h-2 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-t border-border bg-surface-muted outline-none transition-colors hover:bg-brand-soft focus-visible:bg-brand-soft @min-[1160px]:flex"
            onPointerDown={startDrag}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onDividerKeyDown}
          >
            <span
              aria-hidden="true"
              className="h-1 w-10 rounded-full border border-border bg-surface-card transition-colors group-hover:border-brand"
            />
          </div>
          {/* Row click → /hospitals/<hcode>; onSelect still fires so the map
              marker highlights during the route transition. */}
          <div className="min-h-0 border-t border-border @min-[1160px]:flex-1 @min-[1160px]:overflow-auto">
            <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} navigateOnClick />
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} navigateOnClick />
        </div>
      )}
    </section>
  );
}
