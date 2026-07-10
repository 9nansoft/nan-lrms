'use client';

// Full-screen overlay shown to the caller: ringing progress with cancel, and
// terminal feedback (declined / missed / failed) with dismiss.
import { Loader2, PhoneOff, X } from 'lucide-react';

export type OutgoingPhase = 'ringing' | 'declined' | 'missed' | 'failed';

interface OutgoingCallOverlayProps {
  peerName: string;
  peerHospitalName: string;
  phase: OutgoingPhase;
  errorMessage?: string | null;
  onCancel: () => void;
  onDismiss: () => void;
}

const PHASE_LABEL: Record<Exclude<OutgoingPhase, 'ringing'>, string> = {
  declined: 'ผู้รับสายปฏิเสธการโทร',
  missed: 'ไม่มีผู้รับสาย (หมดเวลาเรียก)',
  failed: 'ไม่สามารถโทรออกได้',
};

export function OutgoingCallOverlay({
  peerName,
  peerHospitalName,
  phase,
  errorMessage,
  onCancel,
  onDismiss,
}: OutgoingCallOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-2xl">
        {phase === 'ringing' ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
            <div className="mt-3 text-[13px] font-medium text-slate-500">กำลังโทรหา…</div>
            <div className="mt-1 text-[16px] font-bold text-slate-900">{peerName}</div>
            <div className="text-[12px] text-slate-500">{peerHospitalName}</div>
            <button
              onClick={onCancel}
              className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700"
            >
              <PhoneOff className="h-4 w-4" /> ยกเลิก
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100">
              <PhoneOff className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-3 text-[15px] font-bold text-slate-900">{PHASE_LABEL[phase]}</div>
            <div className="mt-1 text-[13px] text-slate-600">
              {phase === 'failed' && errorMessage
                ? errorMessage
                : `${peerName} · ${peerHospitalName}`}
            </div>
            <button
              onClick={onDismiss}
              className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-300 px-4 py-2 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <X className="h-4 w-4" /> ปิด
            </button>
          </>
        )}
      </div>
    </div>
  );
}
