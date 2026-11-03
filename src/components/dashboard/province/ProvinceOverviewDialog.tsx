// Full-viewport map + list. The list here toggle-selects (opening the
// hospital detail dialog via onSelect), unlike the panel, which navigates.
'use client';

import type { DashboardHospital } from '@/types/api';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ProvinceMap } from '@/components/dashboard/ProvinceMap';
import { HospitalTable } from '@/components/dashboard/HospitalTable';
import { cn } from '@/lib/utils';
import { OverviewModeToggle, type OverviewMode } from './OverviewModeToggle';

export interface ProvinceOverviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitals: DashboardHospital[];
  onlineCount: number;
  selected: string | null;
  onSelect: (hcode: string | null) => void;
  mode: OverviewMode;
  onModeChange: (mode: OverviewMode) => void;
}

export function ProvinceOverviewDialog({
  open,
  onOpenChange,
  hospitals,
  onlineCount,
  selected,
  onSelect,
  mode,
  onModeChange,
}: ProvinceOverviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[92vh] w-[96vw] max-w-[96vw]! grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-surface-page p-0 sm:max-w-[96vw]">
        <DialogHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b border-border bg-brand px-5 py-3">
          <div className="min-w-0">
            <DialogTitle className="text-title text-white">ภาพรวมโรงพยาบาล</DialogTitle>
            <DialogDescription className="text-label text-white/80">
              เชื่อมต่ออยู่ {onlineCount}/{hospitals.length} แห่ง · กด ESC เพื่อปิด
            </DialogDescription>
          </div>
          <div className="pr-10">
            <OverviewModeToggle mode={mode} onChange={onModeChange} onBrand />
          </div>
        </DialogHeader>
        <div
          className={cn(
            'grid min-h-0 overflow-hidden',
            mode === 'map' ? 'grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]' : 'grid-cols-1',
          )}
        >
          {mode === 'map' && (
            <div className="min-h-0 border-r border-border bg-surface-card">
              <ProvinceMap hospitals={hospitals} selected={selected} onSelect={onSelect} size="full" />
            </div>
          )}
          <div className="flex min-h-0 flex-col overflow-hidden bg-surface-card p-4">
            <div className="min-h-0 flex-1 overflow-auto">
              <HospitalTable hospitals={hospitals} selected={selected} onSelect={onSelect} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
