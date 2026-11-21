// ConsultInboxList — the HUB consults addressed to this hospital's OB-GYN
// team, newest first, each expandable to answer in place.
//
// A row carries the requesting context (hospital, patient, urgency, reason)
// and a link to the consulted admission — the hub clinician can see the
// whole record (a provincial hub sees the province), then type the advice
// and mark it answered without leaving this page.
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusChip } from '@/components/shared/StatusChip';
import { Button } from '@/components/ui/button';
import type { ConsultStatus, ConsultUrgency, HubConsultInboxItem } from '@/types/api';
import type { StatusTone } from '@/config/status-tone';
import { fmtDateTimeTh } from '@/components/patient/detail/format';

const STATUS_LABEL: Record<ConsultStatus, string> = {
  REQUESTED: 'รอคำตอบ',
  CONTACTED: 'กำลังปรึกษา',
  COMPLETED: 'ตอบแล้ว',
};

const STATUS_TONE_MAP: Record<ConsultStatus, StatusTone> = {
  REQUESTED: 'warn',
  CONTACTED: 'brand',
  COMPLETED: 'ok',
};

const URGENCY_LABEL: Record<ConsultUrgency, string> = {
  ROUTINE: 'ปกติ',
  URGENT: 'ด่วน',
  EMERGENCY: 'ฉุกเฉิน',
};

const URGENCY_TONE: Record<ConsultUrgency, StatusTone> = {
  ROUTINE: 'neutral',
  URGENT: 'warn',
  EMERGENCY: 'danger',
};

const fieldCls =
  'w-full rounded-lg border border-border bg-surface-card px-2 py-1.5 text-caption text-ink placeholder:text-ink-subtle focus:border-brand focus:outline-none';

export interface ConsultInboxListProps {
  consults: HubConsultInboxItem[];
  /** Answers one consult (COMPLETED + advice). Throws with a Thai message. */
  onAnswer: (consult: HubConsultInboxItem, advice: string) => Promise<unknown>;
  /** Progresses a consult without answering (REQUESTED → กำลังปรึกษา). */
  onProgress: (consult: HubConsultInboxItem) => Promise<unknown>;
}

export function ConsultInboxList({ consults, onAnswer, onProgress }: ConsultInboxListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [adviceDrafts, setAdviceDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function run(consult: HubConsultInboxItem, action: () => Promise<unknown>) {
    setRowError(null);
    setBusy(consult.id);
    try {
      await action();
    } catch (e) {
      setRowError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setBusy(null);
    }
  }

  if (consults.length === 0) {
    return (
      <EmptyState
        title="ไม่มีคำปรึกษา"
        description="ยังไม่มีคำปรึกษาที่ส่งขึ้นมาที่โรงพยาบาลของท่าน — เมื่อโรงพยาบาลชุมชนขอปรึกษา รายการจะแสดงที่นี่"
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {consults.map((consult) => {
        const expanded = expandedId === consult.id;
        const advice = adviceDrafts[consult.id] ?? '';
        const updating = busy === consult.id;
        return (
          <li
            key={consult.id}
            data-testid="consult-inbox-row"
            className="flex flex-col gap-2 rounded-xl border border-border bg-surface-card px-3 py-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone={STATUS_TONE_MAP[consult.status]} label={STATUS_LABEL[consult.status]} />
              <StatusChip tone={URGENCY_TONE[consult.urgencyLevel]} label={URGENCY_LABEL[consult.urgencyLevel]} />
              <span className="text-label font-semibold text-ink">{consult.doctorName}</span>
              {consult.doctorPosition && (
                <span className="text-caption text-ink-muted">{consult.doctorPosition}</span>
              )}
              <span className="ml-auto text-caption text-ink-muted">
                ขอเมื่อ {fmtDateTimeTh(consult.createdAt)}
              </span>
            </div>

            <p className="text-caption text-ink">
              <span className="font-semibold">ผู้ป่วย:</span>{' '}
              {consult.patientName ?? 'ไม่ทราบชื่อ'} · AN {consult.an} ·{' '}
              <span className="text-ink-muted">{consult.requesterHospitalName}</span>
              <Link
                href={`/patients/${consult.patientUrlId}`}
                className="ml-2 inline-flex items-center gap-0.5 text-brand underline"
              >
                เปิดข้อมูลผู้ป่วย <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </p>

            <p className="text-caption text-ink">
              <span className="font-semibold">เหตุผล:</span> {consult.reason}
            </p>

            {consult.requestedByName && (
              <p className="text-caption text-ink-muted">
                ผู้ขอ: <span className="text-ink">{consult.requestedByName}</span>
              </p>
            )}

            {consult.advice && (
              <p className="text-caption text-ink">
                <span className="font-semibold">คำแนะนำ:</span> {consult.advice}
              </p>
            )}
            {consult.answeredByName && (
              <p className="text-caption text-ink-muted">
                ตอบโดย: <span className="text-ink">{consult.answeredByName}</span>
              </p>
            )}

            {consult.status !== 'COMPLETED' && (
              <div className="flex flex-col gap-2 border-t border-border pt-2">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : consult.id)}
                  className="w-fit text-caption text-brand underline"
                >
                  {expanded ? 'ย่อ' : 'ตอบคำปรึกษา'}
                </button>
                {expanded && (
                  <>
                    <label
                      htmlFor={`inbox-advice-${consult.id}`}
                      className="text-caption font-semibold text-ink"
                    >
                      คำแนะนำจากแพทย์
                    </label>
                    <textarea
                      id={`inbox-advice-${consult.id}`}
                      value={advice}
                      rows={3}
                      maxLength={1000}
                      placeholder="เช่น ประเมินภายใน 30 นาที ถ้า BP สูงกว่า 160/110 ให้ส่งต่อ"
                      onChange={(e) =>
                        setAdviceDrafts((current) => ({ ...current, [consult.id]: e.target.value }))
                      }
                      className={fieldCls}
                    />
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  {consult.status === 'REQUESTED' && (
                    <Button
                      type="button"
                      disabled={updating}
                      onClick={() => void run(consult, () => onProgress(consult))}
                      className="h-8 border-border bg-surface-card px-3 text-label text-brand hover:bg-brand-soft"
                    >
                      กำลังปรึกษา
                    </Button>
                  )}
                  {expanded && (
                    <Button
                      type="button"
                      disabled={updating || !advice.trim()}
                      onClick={() => void run(consult, () => onAnswer(consult, advice.trim()))}
                      className="h-8 bg-brand px-3 text-label text-white hover:bg-brand-strong"
                    >
                      ตอบแล้ว
                    </Button>
                  )}
                </div>
              </div>
            )}

            {rowError && (
              <p role="alert" className="text-caption text-danger-text">
                {rowError}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
