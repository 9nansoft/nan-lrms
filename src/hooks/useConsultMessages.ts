// SWR hook — one HUB consult's thread, fetched only while the thread is
// open (the SWR key goes null when it closes, so nothing polls in the
// background), with `sendMessage` posting into it.
//
// Liveness is two-layered, the same way the consult list is: the thread's
// own polling every 5s is the fallback, and the SSE broadcast each message
// triggers (consult_message) refreshes it instantly — the ConsultThread
// component wires that event to this hook's mutate.
'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import type { ConsultMessage, ConsultMessagesResponse } from '@/types/api';

/** What the API answers when a write is refused. */
interface ApiErrorBody {
  error?: { code?: string; message?: string } | string;
}

/**
 * The human message of a refused write.
 *
 * The API answers in two shapes: `{ error: { code, message } }` (the current
 * contract) and `{ error: 'ข้อความ', code }` (the older string form). Both
 * carry a Thai sentence the user can act on, so both are read here.
 */
function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as ApiErrorBody).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (
    error &&
    typeof error === 'object' &&
    typeof error.message === 'string' &&
    error.message.trim()
  ) {
    return error.message;
  }
  return fallback;
}

export function useConsultMessages(patientId: string | null, consultId: string | null) {
  const { data, isLoading, error, mutate } = useSWR<ConsultMessagesResponse>(
    // Null while the thread is closed — an unopened thread never fetches.
    patientId && consultId
      ? `/api/patients/${patientId}/consults/${consultId}/messages`
      : null,
    { refreshInterval: 5000 },
  );

  /** Posts one message into the thread. Throws with a Thai message when
   *  refused (no right, consult closed, message empty or too long). */
  const sendMessage = useCallback(
    async (body: string): Promise<ConsultMessage> => {
      if (!patientId || !consultId) {
        throw new Error('ส่งข้อความไม่สำเร็จ — เปิดคำปรึกษาที่ต้องการส่งก่อน');
      }
      const res = await fetch(
        `/api/patients/${patientId}/consults/${consultId}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ body }),
        },
      );
      const parsed = (await res.json().catch(() => null)) as { message?: ConsultMessage } | null;
      if (!res.ok || !parsed?.message) {
        throw new Error(apiErrorMessage(parsed, 'ส่งข้อความไม่สำเร็จ — ลองใหม่อีกครั้ง'));
      }
      // The thread changed — refresh it so the message shows up right away.
      await mutate();
      return parsed.message;
    },
    [patientId, consultId, mutate],
  );

  /** Stamps this person's read receipt so the lists' "มีใหม่" badge
   *  clears — the thread is open, so everything in it has been seen.
   *  Never throws (a failed receipt must not break the open thread). */
  const markRead = useCallback(async (): Promise<void> => {
    if (!patientId || !consultId) return;
    try {
      await fetch(`/api/patients/${patientId}/consults/${consultId}/messages/read`, {
        method: 'POST',
        credentials: 'same-origin',
      });
    } catch {
      // The badge refreshes on the next poll anyway.
    }
  }, [patientId, consultId]);

  return {
    messages: data?.messages ?? [],
    isLoading,
    error,
    mutate,
    sendMessage,
    markRead,
  };
}
