// ConsultThread — the message thread of ONE HUB consult: the conversation
// between the requesting hospital's care team and the provincial hub's
// OB-GYN team, bound to the consult's AN. Both sides see the same messages;
// bubbles sit right when the sender is on the viewer's side of the consult,
// left when they are the other team, and the consult's own status moves are
// centered SYSTEM notes.
//
// Who may write mirrors the server's rule exactly (services/
// consult-messages.ts consultThreadAccess): the requesting hospital's team,
// or the hub's clinicians — and nothing once the consult is COMPLETED. The
// server stays authoritative; this gate only decides what the UI offers.
//
// The thread is mounted only when its row is expanded, so it fetches and
// polls (5s fallback) only then; a message's SSE broadcast (consult_message)
// refreshes it instantly.
'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useConsultMessages } from '@/hooks/useConsultMessages';
import { useSSE } from '@/hooks/useSSE';
import { debounceLeadingTrailing, SSE_REFRESH_DEBOUNCE_MS } from '@/lib/debounce';
import { parsePatientId } from '@/lib/utils';
import { fmtDateTimeTh } from '@/components/patient/detail/format';
import type { ConsultMessage, PatientConsult } from '@/types/api';
import { cn } from '@/lib/utils';

/** Mirrors the server's MAX_CONSULT_MESSAGE_LENGTH (services/consults.ts) —
 *  the service file is server-side, so the client carries its own copy. */
const MAX_MESSAGE_LENGTH = 2000;

const fieldCls =
  'w-full rounded-lg border border-border bg-surface-card px-2 py-1.5 text-caption text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

/** The signed-in viewer, as far as the thread's gating needs to know. */
export interface ConsultViewer {
  role?: string | null;
  hospitalCode?: string | null;
  userCid?: string | null;
}

export interface ConsultThreadProps {
  /** The admission in URL form: {hcode}-{an} — the thread's AN anchor. */
  patientId: string;
  /** The consult whose thread this is. */
  consult: PatientConsult;
  /** The signed-in session, for the read/write gating. */
  viewer?: ConsultViewer | null;
  /** The consulted patient's name, when the caller has it (the inbox does). */
  patientName?: string | null;
  /** The requesting hospital's name, when the caller has it (the inbox does). */
  requesterHospitalName?: string | null;
}

/** Which side of the consult a message was written from. */
type ThreadSide = 'requester' | 'hub';

function viewerSide(consult: PatientConsult, viewer: ConsultViewer | null | undefined): ThreadSide {
  if (viewer?.hospitalCode && viewer.hospitalCode === consult.targetHospitalHcode) return 'hub';
  return 'requester';
}

// HUB: a bubble's side is the hospital that sent it. INTERNAL: everyone is
// the same hospital, so a bubble is "mine" when the sender's CID is the
// viewer's own — the other bubbles sit across the aisle.
function messageSide(
  message: ConsultMessage,
  consult: PatientConsult,
  viewer: ConsultViewer | null | undefined,
): ThreadSide {
  if (consult.consultScope === 'HUB') {
    return message.senderHospitalId === consult.hospitalId ? 'requester' : 'hub';
  }
  return viewer?.userCid && message.senderCid === viewer.userCid ? 'requester' : 'hub';
}

/** The client mirror of the server's write rule — what the UI offers. */
function canWriteThread(
  consult: PatientConsult,
  viewer: ConsultViewer | null | undefined,
  requesterHcode: string,
): boolean {
  if (consult.status === 'COMPLETED') return false;
  if (!viewer?.hospitalCode) return false;
  if (viewer.hospitalCode === consult.targetHospitalHcode) {
    return viewer.role === 'OBSTETRICIAN' || viewer.role === 'ADMIN';
  }
  // The requesting side (and every INTERNAL consult): the viewer is signed
  // into the patient's hospital.
  return viewer.hospitalCode === requesterHcode;
}

export function ConsultThread({
  patientId,
  consult,
  viewer,
  patientName,
  requesterHospitalName,
}: ConsultThreadProps) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { messages, isLoading, error, mutate, sendMessage, markRead } = useConsultMessages(
    patientId,
    consult.id,
  );

  // A message (or status move) of THIS consult announced over SSE refreshes
  // the thread instantly; the 5s polling above is only the fallback.
  const debouncedMutate = debounceLeadingTrailing(() => {
    void mutate();
  }, SSE_REFRESH_DEBOUNCE_MS);
  useSSE({
    onPatientUpdate: (event) => {
      if (event.consultId && event.consultId !== consult.id) return;
      if (!event.consultId && event.an !== consult.an) return;
      debouncedMutate();
    },
  });

  // New messages land at the bottom — keep the latest one in view.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  // Open = read: everything in the thread has been seen while it stays
  // mounted, so the lists' "มีใหม่" badge clears for this person.
  useEffect(() => {
    if (messages.length === 0) return;
    void markRead();
  }, [messages.length, markRead]);

  const requesterHcode = parsePatientId(patientId)?.hcode ?? '';
  const mySide = viewerSide(consult, viewer);
  const mayWrite = canWriteThread(consult, viewer, requesterHcode);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmed = draft.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await sendMessage(trimmed);
      setDraft('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'ส่งข้อความไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      data-testid="consult-thread"
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface-page px-3 py-2"
    >
      {/* The AN anchor: whatever page this thread renders on, it names the
          admission it belongs to, so two patients' threads never blur. */}
      <p className="text-caption font-semibold text-ink-muted">
        บทสนทนา · AN {consult.an}
        {patientName ? ` · ${patientName}` : ''}
        {requesterHospitalName ? ` · ${requesterHospitalName}` : ''}
        {consult.targetHospitalName ? ` ↔ ${consult.targetHospitalName}` : ''}
      </p>

      <div
        ref={scrollRef}
        data-testid="consult-thread-messages"
        className="flex max-h-64 flex-col gap-2 overflow-y-auto"
      >
        {isLoading && <p className="text-caption text-ink-muted">กำลังโหลดบทสนทนา…</p>}
        {!isLoading && Boolean(error) && (
          <p role="alert" className="text-caption text-danger-text">
            ดึงบทสนทนาไม่สำเร็จ — ระบบจะลองใหม่อัตโนมัติ
          </p>
        )}
        {!isLoading && !error && messages.length === 0 && (
          <p className="text-caption text-ink-subtle">
            ยังไม่มีข้อความ — เริ่มบทสนทนาได้เลย ทั้งสองฝั่งเห็นข้อความเดียวกัน
          </p>
        )}
        {messages.map((message) => {
          if (message.messageType === 'SYSTEM') {
            return (
              <p
                key={message.id}
                data-testid="consult-thread-system"
                className="self-center rounded-full bg-surface-muted px-3 py-1 text-center text-caption text-ink-muted"
              >
                {message.body} · {fmtDateTimeTh(message.createdAt)}
              </p>
            );
          }
          const mine = messageSide(message, consult, viewer) === mySide;
          return (
            <div
              key={message.id}
              data-testid="consult-thread-message"
              className={cn(
                'flex flex-col gap-0.5 rounded-2xl px-3 py-2',
                mine ? 'self-end items-end bg-brand-soft' : 'self-start items-start bg-surface-muted',
              )}
            >
              <p className="text-caption font-semibold text-ink">
                {message.senderName}
                {message.senderHospitalName && (
                  <span className="font-normal text-ink-muted"> · {message.senderHospitalName}</span>
                )}
              </p>
              <p className="whitespace-pre-wrap text-caption text-ink">{message.body}</p>
              <p className="text-caption text-ink-subtle">{fmtDateTimeTh(message.createdAt)}</p>
            </div>
          );
        })}
      </div>

      {mayWrite ? (
        <form onSubmit={(e) => void handleSend(e)} className="flex flex-col gap-1">
          <label htmlFor={`consult-thread-input-${consult.id}`} className="sr-only">
            ข้อความ
          </label>
          <textarea
            id={`consult-thread-input-${consult.id}`}
            data-testid="consult-thread-input"
            value={draft}
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="พิมพ์ข้อความถึงอีกฝั่ง — ทั้งสองฝั่งเห็นข้อความเดียวกัน"
            onChange={(e) => setDraft(e.target.value)}
            className={fieldCls}
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              data-testid="consult-thread-send"
              disabled={busy || !draft.trim()}
              className="h-8 gap-1 bg-brand px-3 text-label text-white hover:bg-brand-strong"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              ส่งข้อความ
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-caption text-ink-muted">
          {consult.status === 'COMPLETED'
            ? 'ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว'
            : 'ท่านอ่านบทสนทนาได้อย่างเดียว — ฝั่งผู้ขอและแพทย์ของโรงพยาบาลแม่ข่ายเท่านั้นที่ส่งข้อความได้'}
        </p>
      )}

      {formError && (
        <p role="alert" className="text-caption text-danger-text">
          {formError}
        </p>
      )}
    </div>
  );
}
