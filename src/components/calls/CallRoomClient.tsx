'use client';

// Client body of /calls/[id]: resolves the call (participant-guarded API),
// shows the peer identity, embeds the Jitsi room and reports hang-up.
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, PhoneOff } from 'lucide-react';
import { JitsiRoom } from './JitsiRoom';

interface CallView {
  callId: string;
  roomId: string;
  status: string;
  callerUserId: string;
  callerName: string;
  calleeUserId: string;
  calleeName: string;
}

const FINISHED_STATUSES = new Set(['declined', 'cancelled', 'missed', 'ended']);

export function CallRoomClient({ callId }: { callId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [call, setCall] = useState<CallView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/calls/${callId}`);
        const body = (await res.json()) as CallView & { message?: string };
        if (cancelled) return;
        if (res.ok) setCall(body);
        else setError(body.message ?? 'ไม่พบข้อมูลสายนี้');
      } catch {
        if (!cancelled) setError('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [callId]);

  const leave = useCallback(() => {
    // Best-effort end; the peer also ends on their side and INVALID_STATE
    // (already ended) is fine to ignore.
    void fetch(`/api/calls/${callId}/end`, { method: 'POST' }).catch(() => {});
    router.back();
  }, [callId, router]);

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-[15px] font-semibold text-white">{error}</p>
          <button
            onClick={() => router.back()}
            className="mt-4 cursor-pointer rounded-md border border-white/30 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/10"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-2 text-[14px] text-white/80">
          <Loader2 className="h-5 w-5 animate-spin" /> กำลังเชื่อมต่อห้องสนทนา…
        </div>
      </div>
    );
  }

  if (FINISHED_STATUSES.has(call.status)) {
    return (
      <div className="grid min-h-screen place-items-center p-6 text-center">
        <div>
          <p className="text-[15px] font-semibold text-white">สายนี้สิ้นสุดแล้ว</p>
          <button
            onClick={() => router.back()}
            className="mt-4 cursor-pointer rounded-md border border-white/30 px-4 py-2 text-[13px] font-semibold text-white hover:bg-white/10"
          >
            กลับ
          </button>
        </div>
      </div>
    );
  }

  const isCaller = session?.user?.id === call.callerUserId;
  const peerName = isCaller ? call.calleeName : call.callerName;
  const displayName = session?.user?.name
    ? `${session.user.name} (${session.user.hospitalName ?? ''})`
    : 'KK-LRMS';

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between bg-slate-900 px-4 py-2">
        <div className="text-[13px] text-white/80">
          กำลังสนทนากับ <span className="font-semibold text-white">{peerName}</span>
        </div>
        <button
          onClick={leave}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-red-700"
        >
          <PhoneOff className="h-3.5 w-3.5" /> วางสาย
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <JitsiRoom roomId={call.roomId} displayName={displayName} onLeft={leave} />
      </div>
    </div>
  );
}
