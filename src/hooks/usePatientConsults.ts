// SWR hook — the consults of one admission, and the doctors of its hospital
// that can be consulted.
//
// A consult is the care team asking one of the hospital's OWN doctors for
// advice about a patient who stays here. It is NOT a referral (that moves
// the patient to another hospital — /api/referrals, its own page and its own
// permissions).
//
// The doctors come from the hospital's admin-managed consult list; the API
// sends them together with the consults, so the request form never has to
// guess who may be asked.
// SWR hook — the consults of one admission, the doctors of its hospital,
// and the provincial hub its HUB consults go up to.
//
// INTERNAL consults ask a doctor of the patient's OWN hospital (the classic
// flow). HUB consults send the question UP to the provincial hub hospital's
// registered OB-GYN team — the hub's doctors come with the response, so the
// request form never has to guess who may be asked.
'use client';

import { useCallback } from 'react';
import useSWR from 'swr';
import type {
  ConsultStatus,
  ConsultUrgency,
  PatientConsult,
  PatientConsultsResponse,
} from '@/types/api';

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

/** What may change on a consult: its state and what the doctor said. */
export interface UpdateConsultInput {
  status?: ConsultStatus;
  advice?: string;
}

/** What a consult request carries: the addressed doctor, the reason, and —
 *  for a HUB request — how urgent it is. */
export interface RequestConsultInput {
  doctorId: string;
  reason: string;
  mode?: 'INTERNAL' | 'HUB';
  urgency?: ConsultUrgency;
}

export function usePatientConsults(patientId: string | null) {
  const { data, isLoading, error, mutate } = useSWR<PatientConsultsResponse>(
    patientId ? `/api/patients/${patientId}/consults` : null,
    { refreshInterval: 30000 },
  );

  /** Records a consult request. Throws with a Thai message when refused. */
  const requestConsult = useCallback(
    async (input: RequestConsultInput): Promise<PatientConsult> => {
      if (!patientId) {
        throw new Error('ไม่พบข้อมูลผู้คลอด — กลับไปเปิดหน้าผู้คลอดแล้วลองใหม่อีกครั้ง');
      }
      const res = await fetch(`/api/patients/${patientId}/consults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as { consult?: PatientConsult } | null;
      if (!res.ok || !body?.consult) {
        throw new Error(apiErrorMessage(body, 'ขอปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง'));
      }
      // The list changed — refresh it so the new consult shows up right away.
      await mutate();
      return body.consult;
    },
    [patientId, mutate],
  );

  /** Moves a consult on and writes the advice. Throws when refused. */
  const updateConsult = useCallback(
    async (consultId: string, input: UpdateConsultInput): Promise<PatientConsult> => {
      if (!patientId) {
        throw new Error('ไม่พบข้อมูลผู้คลอด — กลับไปเปิดหน้าผู้คลอดแล้วลองใหม่อีกครั้ง');
      }
      const res = await fetch(`/api/patients/${patientId}/consults/${consultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      const body = (await res.json().catch(() => null)) as { consult?: PatientConsult } | null;
      if (!res.ok || !body?.consult) {
        throw new Error(apiErrorMessage(body, 'อัปเดตการปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง'));
      }
      await mutate();
      return body.consult;
    },
    [patientId, mutate],
  );

  return {
    consults: data?.consults ?? [],
    doctors: data?.doctors ?? [],
    hub: data?.hub ?? null,
    isLoading,
    error,
    mutate,
    requestConsult,
    updateConsult,
  };
}
