// Hospital maternity-ward kiosk page (Task 25). Renders the room-grouped
// WardLayoutView for the first ward returned by the BMS Session API, with a
// header summary (ward name, total/occupied/free counts) and a manual refresh
// button. Task 40 wires the PatientDrawer: clicking a bed opens the drawer
// with the matching occupant; closing resets selection.
'use client';
import { useEffect, useState } from 'react';
import { useBmsSession } from '@/hooks/useBmsSession';
import { useMaternityWardState } from '@/hooks/useMaternityWardState';
import {
  WardLayoutView,
  type BedMovePayload,
} from '@/components/maternity/WardLayoutView';
import { PatientDrawer } from '@/components/maternity/PatientDrawer';
import {
  getBedMoveReasons,
  movePatientBed,
} from '@/services/maternity-ward';
import { RefreshCw } from 'lucide-react';

export default function HospitalMaternityWardPage() {
  const { isReady, error: sessionError, config, userInfo } = useBmsSession();
  const { wards, ward, beds, occupancy, isLoading, error, mutateBeds, mutateOccupancy } =
    useMaternityWardState();
  const [selectedAn, setSelectedAn] = useState<string | null>(null);
  const [reasons, setReasons] = useState<string[]>([]);

  // Lazy-load the reason list once a session is available. Failures fall back
  // to an empty list — the modal Confirm button stays disabled in that case.
  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    getBedMoveReasons(config)
      .then((rs) => {
        if (!cancelled) setReasons(rs);
      })
      .catch(() => {
        if (!cancelled) setReasons([]);
      });
    return () => {
      cancelled = true;
    };
  }, [config]);

  if (sessionError) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <p className="text-red-600">เกิดข้อผิดพลาด: {sessionError}</p>
      </div>
    );
  }
  if (!isReady) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-slate-500">
        เปิดหน้านี้จาก HOSxP เพื่อใช้งาน
        <br />
        <span className="text-xs">(ไม่พบ BMS Session — กรุณาเข้าผ่าน HOSxP)</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-red-600">
        ไม่สามารถโหลดข้อมูลห้องคลอด: {error.message}
      </div>
    );
  }

  if (isLoading || !ward) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-slate-500">กำลังโหลด…</div>
    );
  }

  const occupiedCount = occupancy.length;
  const totalBeds = beds.length;
  const wardName = wards.find((w) => w.ward === ward)?.name ?? `ward ${ward}`;
  const selectedOccupant = selectedAn
    ? (occupancy.find((o) => o.an === selectedAn) ?? null)
    : null;

  const handleRefresh = () => {
    void mutateBeds();
    void mutateOccupancy();
  };

  const handleBedMove = async (payload: BedMovePayload) => {
    if (!config || !userInfo) return;
    try {
      await movePatientBed(config, userInfo, userInfo.hospcode, {
        an: payload.an,
        oldWard: ward!,
        oldBedno: payload.oldBedno,
        newWard: ward!,
        newBedno: payload.newBedno,
        newRoomno: payload.newRoomno,
        reason: payload.reason,
      });
      await Promise.all([mutateBeds(), mutateOccupancy()]);
    } catch (e) {
      // TODO: replace with the shared toast component when available.
      console.error('[bed-move] movePatientBed failed:', e);
    }
  };

  const handleMoveRejected = (reason: 'locked' | 'occupied' | 'no-op') => {
    const msg =
      reason === 'locked'
        ? 'เตียงถูกล็อก'
        : reason === 'occupied'
          ? 'เตียงไม่ว่าง'
          : 'เตียงเดิม — ไม่ต้องย้าย';
    // TODO: replace with the shared toast component when available.
    console.warn(`[bed-move] rejected: ${msg}`);
  };

  return (
    <div className="mx-auto max-w-[1400px] p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{wardName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {totalBeds} เตียง · ใช้งาน {occupiedCount} · ว่าง {totalBeds - occupiedCount}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:border-emerald-400"
        >
          <RefreshCw className="h-4 w-4" /> รีเฟรช
        </button>
      </header>

      <WardLayoutView
        beds={beds}
        occupancy={occupancy}
        onBedClick={setSelectedAn}
        onBedMove={(p) => void handleBedMove(p)}
        onMoveRejected={handleMoveRejected}
        reasons={reasons}
      />
      <PatientDrawer
        open={selectedAn !== null}
        occupant={selectedOccupant}
        onClose={() => setSelectedAn(null)}
      />
    </div>
  );
}
