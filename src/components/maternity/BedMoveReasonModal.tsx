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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-card p-6 shadow-soft">
        <h2 id="bed-move-title" className="text-title text-ink">
          ย้ายเตียง
        </h2>
        <p className="mt-2 text-body text-ink-muted">
          จาก เตียง {fromBedno} ไป เตียง {toBedno}
        </p>

        <label className="mt-4 block text-label text-ink">เหตุผลการย้าย</label>
        <select
          aria-label="เหตุผลการย้าย"
          value={selected}
          onChange={(e) => setChosen(e.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-border bg-surface-card px-3 text-body text-ink focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {reasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        {reasons.length === 0 && (
          <p role="status" className="mt-2 text-caption text-warn-text">
            ยังโหลดเหตุผลการย้ายจาก HOSxP ไม่ได้ — ปิดหน้าต่างแล้วกด รีเฟรช หากยังไม่ได้ แจ้งผู้ดูแลระบบ
          </p>
        )}

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-lg border border-border bg-surface-card px-4 text-label text-ink hover:bg-surface-muted"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selected)}
            disabled={selected === ''}
            className="h-10 rounded-lg bg-brand px-4 text-label text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted"
          >
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
