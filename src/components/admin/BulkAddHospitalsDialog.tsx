// Bulk-add picker used from the ActiveProvince tab: lists every MOPH
// hospital in the currently-selected province that isn't already registered,
// each with a checkbox. A single OK click POSTs all checked rows into the
// operational `hospitals` table in parallel.
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { Plus, Check, Building2, AlertTriangle, Square, CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LoadingState } from '@/components/shared/LoadingState';
import { HospitalServiceType } from '@/types/domain';
import { guessHospitalLevel } from '@/config/hospitals';
import { cn } from '@/lib/utils';

interface MophHospital {
  hcode: string;
  name: string;
  hospitalTypeId: number | null;
  bedCount: number | null;
  provinceCode: string | null;
  districtCode: string | null;
}

interface AdminHospital {
  hcode: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 2-digit MOPH province code to pull MOPH candidates from. */
  provinceCode: string;
  /** Optional human name for the dialog title. */
  provinceName?: string;
  /** Called after at least one hospital is added successfully so the parent
   *  can revalidate its hospital list. */
  onAdded: () => Promise<void> | void;
}

// hospital_type_id 5 (A_S), 6 (M1), 7 (F2) are the tiers that typically have
// maternity wards and are the core of a provincial referral network. Pre-
// selected on dialog open so admins onboarding a new province only need to
// deselect outliers instead of checking 20+ rows.
const DEFAULT_PRESELECT_TYPE_IDS: ReadonlySet<number> = new Set([5, 6, 7]);

// hospital_type_id 5 (A_S / regional) → provincial hub. All others default
// to "has maternity ward" — operator can flip individual small F3 sites to
// DISTRICT_NO_MATERNITY from the edit dialog after.
function defaultServiceType(typeId: number | null): HospitalServiceType {
  if (typeId === 5) return HospitalServiceType.PROVINCIAL_HUB;
  return HospitalServiceType.DISTRICT_WITH_MATERNITY;
}

export function BulkAddHospitalsDialog(props: Props) {
  // Key the inner body on open+provinceCode so state (checkbox selection,
  // errors) resets when the dialog reopens or switches province — instead
  // of a setState-in-effect reset.
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent
        className="p-0"
        style={{ width: 'min(94vw, 1080px)', maxWidth: 'min(94vw, 1080px)' }}
      >
        <BulkAddBody key={`${props.open}-${props.provinceCode}`} {...props} />
      </DialogContent>
    </Dialog>
  );
}

function BulkAddBody({ open, onClose, provinceCode, provinceName, onAdded }: Props) {
  const { data: mophData, isLoading: mophLoading } = useSWR<{ hospitals: MophHospital[] }>(
    open ? `/api/admin/moph-hospitals?province=${provinceCode}` : null,
  );
  const { data: regData, isLoading: regLoading } = useSWR<{ hospitals: AdminHospital[] }>(
    open ? '/api/admin/hospitals' : null,
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Array<{ hcode: string; error: string }>>([]);

  const available = useMemo(() => {
    const registered = new Set((regData?.hospitals ?? []).map((h) => h.hcode));
    return (mophData?.hospitals ?? []).filter((m) => !registered.has(m.hcode));
  }, [mophData, regData]);

  // Apply the A_S/M1/F2 preselect once per dialog open — the key-based
  // remount of BulkAddBody (see parent component) ensures this fires fresh
  // each time the dialog opens or the province changes. Ref-guarded so
  // later SWR revalidations don't clobber user edits.
  const presetAppliedRef = useRef(false);
  useEffect(() => {
    if (presetAppliedRef.current) return;
    if (!mophData || !regData) return;
    presetAppliedRef.current = true;
    const defaults = new Set<string>();
    for (const m of available) {
      if (m.hospitalTypeId !== null && DEFAULT_PRESELECT_TYPE_IDS.has(m.hospitalTypeId)) {
        defaults.add(m.hcode);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelected(defaults);
  }, [mophData, regData, available]);

  const allSelected = available.length > 0 && selected.size === available.length;
  const toggle = (hcode: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(hcode)) next.delete(hcode);
      else next.add(hcode);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === available.length ? new Set() : new Set(available.map((m) => m.hcode)),
    );
  };

  const handleOk = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    setErrors([]);

    const picks = available.filter((m) => selected.has(m.hcode));
    // Parallel POSTs — each hospital is independent and the admin API is
    // idempotent (duplicate hcode returns 409 which we capture per-row).
    const results = await Promise.all(
      picks.map(async (m) => {
        try {
          const res = await fetch('/api/admin/hospitals', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              hcode: m.hcode,
              name: m.name,
              level: guessHospitalLevel(m.hospitalTypeId),
              serviceType: defaultServiceType(m.hospitalTypeId),
              provinceCode: m.provinceCode,
              districtCode: m.districtCode,
              isActive: true,
            }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            return { hcode: m.hcode, error: err?.error ?? `HTTP ${res.status}` };
          }
          return null;
        } catch (e) {
          return { hcode: m.hcode, error: (e as Error).message };
        }
      }),
    );

    const failures = results.filter((r): r is { hcode: string; error: string } => r !== null);
    setErrors(failures);
    setBusy(false);

    // Refresh caller's list regardless — even on partial failure, successful
    // inserts should appear immediately.
    await onAdded();

    if (failures.length === 0) onClose();
  };

  const isLoading = mophLoading || regLoading;

  return (
    <>
      <DialogHeader className="border-b border-border px-5 pt-4 pb-3">
        <DialogTitle className="flex flex-col gap-0.5">
          <div className="text-label text-ink-muted">เพิ่มหลายโรงพยาบาล · จังหวัด {provinceCode}</div>
          <div className="text-body-lg font-semibold text-ink">
            เพิ่มโรงพยาบาลในจังหวัด{provinceName ? ` ${provinceName}` : ''}
          </div>
        </DialogTitle>
      </DialogHeader>

      <div className="max-h-[65vh] overflow-y-auto bg-surface-muted px-5 py-4">
        {isLoading ? (
          <LoadingState message="กำลังโหลดทะเบียน MOPH..." />
        ) : available.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-card px-4 py-6 text-center text-body text-ink-muted">
            ไม่มีโรงพยาบาลเหลืออยู่ในทะเบียน MOPH ของจังหวัดนี้ที่ยังไม่ถูกเพิ่ม
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-label">
              <button
                type="button"
                onClick={toggleAll}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-surface-card px-3 text-ink-muted hover:bg-brand-soft"
                disabled={busy}
              >
                {allSelected ? (
                  <CheckSquare aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Square aria-hidden="true" className="h-4 w-4" />
                )}
                {allSelected ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
              </button>
              <span className="text-ink-muted">
                เลือกแล้ว {selected.size} / {available.length}
              </span>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-surface-card">
              <div className="grid grid-cols-[40px_80px_minmax(0,1fr)_60px_60px] gap-2 border-b border-border px-3 py-2 text-label text-ink-muted">
                <span>เลือก</span>
                <span>รหัส</span>
                <span>ชื่อโรงพยาบาล</span>
                <span>ระดับ</span>
                <span className="text-right">เตียง</span>
              </div>
              {available.map((m) => {
                const isSel = selected.has(m.hcode);
                const lvl = guessHospitalLevel(m.hospitalTypeId);
                return (
                  <label
                    key={m.hcode}
                    className={cn(
                      'grid cursor-pointer grid-cols-[40px_80px_minmax(0,1fr)_60px_60px] items-center gap-2 border-b border-border px-3 py-2 text-body text-ink last:border-b-0 hover:bg-brand-soft',
                      isSel && 'bg-brand-soft',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(m.hcode)}
                      disabled={busy}
                      className="h-5 w-5 accent-brand"
                    />
                    <span className="font-mono text-caption text-ink-muted">{m.hcode}</span>
                    <span className="flex items-center gap-1.5 truncate">
                      <Building2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                      <span className="truncate">{m.name}</span>
                    </span>
                    <span className="font-mono text-caption text-ink-muted">{lvl}</span>
                    <span className="text-right text-caption tabular-nums text-ink-muted">
                      {m.bedCount ?? '—'}
                    </span>
                  </label>
                );
              })}
            </div>

            <p className="mt-2 text-caption text-ink-muted">
              ระบบจะเลือกระดับจาก hospital_type_id และตั้ง service_type ให้ตามค่าเริ่มต้น —
              สามารถแก้ไขรายตัวได้ในแท็บ &ldquo;โรงพยาบาล&rdquo; หลังเพิ่ม
            </p>

            {errors.length > 0 ? (
              <div role="alert" className="mt-3 space-y-1 rounded-xl border border-danger/40 bg-danger-tint px-3 py-2 text-label text-danger-text">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle aria-hidden="true" className="h-4 w-4" />
                  เพิ่มไม่สำเร็จ {errors.length} รายการ
                </div>
                <p className="text-label">
                  วิธีแก้: รายการที่สำเร็จถูกเพิ่มแล้ว — ตรวจรายการที่ไม่สำเร็จด้านล่าง แล้วกด เพิ่ม อีกครั้งเฉพาะที่เหลือ
                </p>
                {errors.slice(0, 5).map((e) => (
                  <div key={e.hcode}>
                    · {e.hcode} — {e.error}
                  </div>
                ))}
                {errors.length > 5 ? <div>… และอีก {errors.length - 5} รายการ</div> : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      <DialogFooter className="border-t border-border px-5 py-3">
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          ยกเลิก
        </Button>
        <Button
          onClick={handleOk}
          disabled={busy || selected.size === 0 || available.length === 0}
          className="h-10 gap-1.5 bg-brand text-white hover:bg-brand-strong"
        >
          {busy ? <Plus aria-hidden="true" className="h-4 w-4 animate-pulse" /> : <Check aria-hidden="true" className="h-4 w-4" />}
          {busy ? `กำลังเพิ่ม ${selected.size}...` : `เพิ่ม ${selected.size} แห่ง`}
        </Button>
      </DialogFooter>
    </>
  );
}
