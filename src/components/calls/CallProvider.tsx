'use client';

// CallProvider — mounts once per authenticated layout. Owns the per-user
// signaling stream (/api/sse/calls), the incoming/outgoing call state and the
// global call UI (ring toast, outgoing overlay, directory dialog). Business
// rules live server-side in src/services/video-call.ts; this component only
// reflects signaling events.
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { IncomingCallToast } from './IncomingCallToast';
import { OutgoingCallOverlay, type OutgoingPhase } from './OutgoingCallOverlay';
import { CallDirectoryDialog, type DirectoryCallTarget } from './CallDirectoryDialog';

interface IncomingCall {
  callId: string;
  roomId: string;
  caller: { userId: string; name: string; hospitalCode: string; hospitalName: string };
}

interface OutgoingCall {
  callId: string | null;
  peerName: string;
  peerHospitalName: string;
  phase: OutgoingPhase;
  errorMessage?: string | null;
}

interface CallContextValue {
  openDirectory: () => void;
}

const CallContext = createContext<CallContextValue | null>(null);

/** Null when no CallProvider is mounted (e.g. isolated component tests). */
export function useVideoCall(): CallContextValue | null {
  return useContext(CallContext);
}

// Soft ring: two-tone beep via Web Audio. Browsers may block audio until the
// user has interacted with the page — the visual toast is the primary signal.
function useRingtone(active: boolean): void {
  useEffect(() => {
    if (!active || typeof window === 'undefined' || !('AudioContext' in window)) return;
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
    } catch {
      return;
    }
    const beep = (frequency: number, at: number) => {
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = frequency;
        osc.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + at);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
        osc.start(ctx.currentTime + at);
        osc.stop(ctx.currentTime + at + 0.4);
      } catch {
        // Autoplay policy — ignore, the toast is still visible.
      }
    };
    const ring = () => {
      beep(880, 0);
      beep(660, 0.45);
    };
    ring();
    const interval = window.setInterval(ring, 2000);
    return () => {
      window.clearInterval(interval);
      ctx?.close().catch(() => {});
    };
  }, [active]);
}

async function postCallAction(path: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(path, { method: 'POST' });
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: res.ok,
      message: body?.message ?? 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
    };
  } catch {
    return { ok: false, message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง' };
  }
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session } = useSession();
  const userId = session?.user?.id;

  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [outgoing, setOutgoing] = useState<OutgoingCall | null>(null);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  useRingtone(Boolean(incoming));

  // Per-user signaling stream. EventSource reconnects automatically; a ring
  // lost during a reconnect resolves server-side via the 45 s missed timer.
  useEffect(() => {
    if (!userId) return;
    const source = new EventSource('/api/sse/calls');

    const parse = <T,>(event: MessageEvent): T | null => {
      try {
        return JSON.parse(event.data) as T;
      } catch {
        return null;
      }
    };

    const onInvite = (event: MessageEvent) => {
      const data = parse<IncomingCall>(event);
      if (data) setIncoming(data);
    };
    const clearIncoming = (event: MessageEvent) => {
      const data = parse<{ callId: string }>(event);
      setIncoming((current) => (current && data && current.callId === data.callId ? null : current));
    };
    const onAccepted = (event: MessageEvent) => {
      const data = parse<{ callId: string }>(event);
      if (!data) return;
      setOutgoing((current) => {
        if (current?.callId === data.callId) {
          router.push(`/calls/${data.callId}`);
          return null;
        }
        return current;
      });
    };
    const outgoingPhase = (phase: OutgoingPhase) => (event: MessageEvent) => {
      const data = parse<{ callId: string }>(event);
      if (!data) return;
      setOutgoing((current) =>
        current?.callId === data.callId ? { ...current, phase } : current,
      );
    };

    source.addEventListener('call:invite', onInvite);
    source.addEventListener('call:cancelled', clearIncoming);
    source.addEventListener('call:resolved', clearIncoming);
    source.addEventListener('call:accepted', onAccepted);
    source.addEventListener('call:declined', outgoingPhase('declined'));
    source.addEventListener('call:missed', outgoingPhase('missed'));

    return () => {
      source.close();
    };
  }, [userId, router]);

  const placeCall = useCallback(async (target: DirectoryCallTarget) => {
    setDirectoryOpen(false);
    setOutgoing({
      callId: null,
      peerName: target.name,
      peerHospitalName: target.hospitalName,
      phase: 'ringing',
    });
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ calleeUserId: target.userId }),
      });
      const body = (await res.json()) as { callId?: string; message?: string };
      if (res.ok && body.callId) {
        setOutgoing((current) =>
          current ? { ...current, callId: body.callId ?? null } : current,
        );
      } else {
        setOutgoing((current) =>
          current
            ? {
                ...current,
                phase: 'failed',
                errorMessage: body.message ?? 'ไม่สามารถโทรออกได้ กรุณาลองใหม่อีกครั้ง',
              }
            : current,
        );
      }
    } catch {
      setOutgoing((current) =>
        current
          ? {
              ...current,
              phase: 'failed',
              errorMessage: 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง',
            }
          : current,
      );
    }
  }, []);

  const acceptIncoming = useCallback(async () => {
    if (!incoming || actionBusy) return;
    setActionBusy(true);
    const result = await postCallAction(`/api/calls/${incoming.callId}/accept`);
    setActionBusy(false);
    if (result.ok) {
      router.push(`/calls/${incoming.callId}`);
    }
    // Failure means the call was cancelled/timed out — the matching
    // call:cancelled / call:resolved event clears the toast; do it here too
    // in case that event was missed during a reconnect.
    setIncoming(null);
  }, [incoming, actionBusy, router]);

  const declineIncoming = useCallback(async () => {
    if (!incoming || actionBusy) return;
    setActionBusy(true);
    await postCallAction(`/api/calls/${incoming.callId}/decline`);
    setActionBusy(false);
    setIncoming(null);
  }, [incoming, actionBusy]);

  const cancelOutgoing = useCallback(async () => {
    if (outgoing?.callId) {
      await postCallAction(`/api/calls/${outgoing.callId}/cancel`);
    }
    setOutgoing(null);
  }, [outgoing]);

  const openDirectory = useCallback(() => setDirectoryOpen(true), []);

  return (
    <CallContext.Provider value={{ openDirectory }}>
      {children}
      <CallDirectoryDialog
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
        onCall={placeCall}
      />
      {incoming && (
        <IncomingCallToast
          callerName={incoming.caller.name}
          callerHospitalName={incoming.caller.hospitalName}
          onAccept={() => void acceptIncoming()}
          onDecline={() => void declineIncoming()}
          busy={actionBusy}
        />
      )}
      {outgoing && (
        <OutgoingCallOverlay
          peerName={outgoing.peerName}
          peerHospitalName={outgoing.peerHospitalName}
          phase={outgoing.phase}
          errorMessage={outgoing.errorMessage}
          onCancel={() => void cancelOutgoing()}
          onDismiss={() => setOutgoing(null)}
        />
      )}
    </CallContext.Provider>
  );
}
