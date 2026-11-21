// SWR hook — the HUB consult inbox of the signed-in hospital's OB-GYN team.
//
// A HUB consult is the question a community hospital's care team sent UP to
// the provincial hub (this hospital). The team answers it in the system:
// the answer is a PATCH on the consult, which lives on the requesting
// hospital's patient page — the item carries the URL-form patient id for
// exactly that.
'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import type { ConsultInboxResponse, HubConsultInboxItem } from '@/types/api';

/** What the API answers when a write is refused. */
interface ApiErrorBody {
  error?: { code?: string; message?: string } | string;
}

/** The human message of a refused write (both API error shapes). */
function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const error = (body as ApiErrorBody).error;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function useConsultInbox() {
  const { data, isLoading, error, mutate } = useSWR<ConsultInboxResponse>(
    '/api/consults/inbox',
    { refreshInterval: 15000 },
  );

  /** Answers one consult as this hospital's clinician. Throws with a Thai
   *  message when refused. */
  const answerConsult = useCallback(
    async (consult: HubConsultInboxItem, advice: string): Promise<HubConsultInboxItem> => {
      const res = await fetch(`/api/patients/${consult.patientUrlId}/consults/${consult.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status: 'COMPLETED', advice }),
      });
      const body = (await res.json().catch(() => null)) as { consult?: HubConsultInboxItem } | null;
      if (!res.ok || !body?.consult) {
        throw new Error(apiErrorMessage(body, 'ตอบคำปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง'));
      }
      await mutate();
      return body.consult;
    },
    [mutate],
  );

  /** Moves a consult on without answering (e.g. marking it being worked on). */
  const progressConsult = useCallback(
    async (consult: HubConsultInboxItem, status: 'CONTACTED'): Promise<HubConsultInboxItem> => {
      const res = await fetch(`/api/patients/${consult.patientUrlId}/consults/${consult.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ status }),
      });
      const body = (await res.json().catch(() => null)) as { consult?: HubConsultInboxItem } | null;
      if (!res.ok || !body?.consult) {
        throw new Error(apiErrorMessage(body, 'อัปเดตการปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง'));
      }
      await mutate();
      return body.consult;
    },
    [mutate],
  );

  return {
    consults: data?.consults ?? [],
    pendingCount: data?.pendingCount ?? 0,
    isLoading,
    error,
    mutate,
    answerConsult,
    progressConsult,
  };
}
