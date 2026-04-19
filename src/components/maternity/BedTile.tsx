// Task 23: BedTile component — locked / empty / occupied variants for the
// hospital maternity ward layout view. Severity dot is a gray placeholder until
// CDSS roll-up is wired in Task 30+.
'use client';

import { Lock } from 'lucide-react';
import { cn, calculateAge } from '@/lib/utils';
import type { BedOccupancy } from '@/types/maternity-ward';

export interface BedTileProps {
  bedno: string;
  bedLock: 'Y' | 'N' | null;
  occupant?: BedOccupancy | null;
  onClick?: (an: string) => void;
}

function safeAge(birthday: string | null): number | null {
  if (!birthday) return null;
  const parsed = new Date(birthday);
  if (Number.isNaN(parsed.getTime())) return null;
  return calculateAge(parsed);
}

function fullName(o: BedOccupancy): string {
  return [o.pname, o.fname, o.lname].filter(Boolean).join(' ').trim() || 'ไม่ระบุชื่อ';
}

export function BedTile({ bedno, bedLock, occupant, onClick }: BedTileProps) {
  const isLocked = bedLock === 'Y';
  const isOccupied = !isLocked && occupant != null;

  if (isLocked) {
    return (
      <div
        aria-label={`เตียง ${bedno} ล็อก`}
        className="flex h-32 w-32 flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-400"
      >
        <Lock className="h-5 w-5" aria-hidden />
        <span className="mt-1 text-xs">ล็อก</span>
        <span className="sr-only">เตียง {bedno}</span>
        <span className="text-sm font-semibold">{bedno}</span>
      </div>
    );
  }

  if (!isOccupied) {
    return (
      <div
        aria-label={`เตียง ${bedno} ว่าง`}
        className="flex h-32 w-32 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400"
      >
        <span className="text-xs">ว่าง</span>
        <span className="sr-only">เตียง {bedno}</span>
        <span className="text-sm font-semibold">{bedno}</span>
      </div>
    );
  }

  const age = safeAge(occupant.birthday);
  const name = fullName(occupant);
  const { gravida, ga, last_cervix_cm: cervix, incharge_doctor_name: doc } = occupant;

  return (
    <button
      type="button"
      onClick={() => onClick?.(occupant.an)}
      aria-label={`เตียง ${bedno}`}
      className={cn(
        'flex h-32 w-32 flex-col rounded-lg border border-slate-200 bg-white p-2 text-left',
        'shadow-sm transition hover:border-emerald-400 hover:shadow-md',
        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">เตียง {bedno}</span>
        {/* severity placeholder — gray until CDSS roll-up (Task 30+) */}
        <span className="h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden />
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-800">{name}</div>
      {age !== null && <div className="text-xs text-slate-500">{age} ปี</div>}
      {(gravida !== null || ga !== null) && (
        <div className="text-xs text-slate-500">
          {gravida !== null && <span>G{gravida}</span>}
          {gravida !== null && ga !== null && <span> </span>}
          {ga !== null && <span>GA{ga}</span>}
        </div>
      )}
      {cervix !== null && (
        <div className="mt-auto text-xs font-medium text-emerald-700">{cervix} ซม</div>
      )}
      {doc && <div className="truncate text-xs text-slate-400">{doc}</div>}
    </button>
  );
}
