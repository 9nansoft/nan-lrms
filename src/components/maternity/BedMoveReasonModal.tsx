// Task 52: BedMoveReasonModal — presentational dialog for the drag-drop bed
// move flow. The WardLayoutView opens this after a successful drag-drop and
// fires the actual movePatientBed call when onConfirm bubbles up.
'use client';

import { useState } from 'react';

export interface BedMoveReasonModalProps {
  open: boolean;
  reasons: string[];
  onConfirm: (reason: string) => void;
  onCancel: () => void;
  fromBedno: string;
  toBedno: string;
}

export function BedMoveReasonModal({
  open,
  reasons,
  onConfirm,
  onCancel,
  fromBedno,
  toBedno,
}: BedMoveReasonModalProps) {
  // Track the user's pick separately from the "default" so we don't need a
  // setState-in-effect (forbidden by react-hooks/set-state-in-effect). When the
  // user has not chosen anything yet OR has cleared the choice, fall back to
  // the first reason in the list — that way onConfirm always carries a
  // non-empty value as long as `reasons` is non-empty.
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = chosen ?? reasons[0] ?? '';

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bed-move-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2
          id="bed-move-title"
          className="text-lg font-semibold text-slate-900"
        >
          ย้ายเตียง
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          จาก เตียง {fromBedno} ไป เตียง {toBedno}
        </p>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          เหตุผลการย้าย
        </label>
        <select
          aria-label="เหตุผลการย้าย"
          value={selected}
          onChange={(e) => setChosen(e.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        >
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={selected === ''}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
