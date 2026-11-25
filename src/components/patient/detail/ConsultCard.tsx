// Consults — two flows on one card:
//
//   INTERNAL — the care team asks a doctor of THEIR OWN hospital (the
//   admin-managed consult list), contacts them (usually by phone), and
//   records the answer.
//
//   HUB — the care team sends the question UP to the provincial hub
//   hospital's registered OB-GYN team. The hub's clinicians answer IN the
//   system: their session CID must match the addressed doctor's CID (or they
//   are a clinician of that hospital), so the answer box below only appears
//   for them. The requester sees the status move and the advice arrive.
//
// NOT a referral: a referral moves the patient to another hospital (that
// flow has its own page and its own permissions). A consult asks for advice
// about a patient who stays here.
//
// The doctors come from each hospital's admin-managed consult list; the API
// sends them (and the hub info) with the consults, so the request form
// never guesses.
'use client';

import { useState, type FormEvent } from 'react';
import { Stethoscope } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusChip } from '@/components/shared/StatusChip';
import { Button } from '@/components/ui/button';
import { ConsultThread } from '@/components/consult/ConsultThread';
import type { ConsultViewer } from '@/components/consult/ConsultThread';
import type {
  ConsultDoctor,
  ConsultHubInfo,
  ConsultStatus,
  ConsultUrgency,
  PatientConsult,
} from '@/types/api';
import type { StatusTone } from '@/config/status-tone';
import { cn, parsePatientId } from '@/lib/utils';
import { fmtDateTimeTh } from './format';

/** The Thai label of each consult state, per flow. */
const INTERNAL_STATUS_LABEL: Record<ConsultStatus, string> = {
  REQUESTED: 'รอติดต่อ',
  CONTACTED: 'ติดต่อแล้ว',
  COMPLETED: 'ตอบแล้ว',
};

const HUB_STATUS_LABEL: Record<ConsultStatus, string> = {
  REQUESTED: 'รอคำตอบ',
  CONTACTED: 'กำลังปรึกษา',
  COMPLETED: 'ตอบแล้ว',
};

/** The tone of each consult state — the same vocabulary as the rest of the app. */
const CONSULT_STATUS_TONE: Record<ConsultStatus, StatusTone> = {
  REQUESTED: 'warn',
  CONTACTED: 'brand',
  COMPLETED: 'ok',
};

/** The Thai label and tone of each urgency. */
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

/** The signed-in viewer, as far as the gating needs to know. Defined by the
 *  thread (it gates read AND write) and re-exported here for the answer box. */
export type { ConsultViewer } from '@/components/consult/ConsultThread';

export interface ConsultCardProps {
  /** The admission in URL form: {hcode}-{an}. */
  patientId: string;
  /** The consults of this admission, newest first (INTERNAL and HUB). */
  consults: PatientConsult[];
  /** The doctors of this hospital that can be consulted (INTERNAL). */
  doctors: ConsultDoctor[];
  /** The provincial hub this hospital's HUB consults go up to. */
  hub?: ConsultHubInfo | null;
  /** The signed-in session, for the HUB answer gating. */
  viewer?: ConsultViewer | null;
  isLoading?: boolean;
  error?: unknown;
  /** Records a consult request (or a proactive inbox warning from a parent hospital). Throws with a Thai message when refused. */
  onRequestConsult: (input: {
    doctorId?: string;
    reason: string;
    mode?: 'INTERNAL' | 'HUB';
    urgency?: ConsultUrgency;
  }) => Promise<unknown>;
  /** Moves a consult on and writes the advice. Throws when refused. */
  onUpdateConsult: (
    consultId: string,
    input: { status?: ConsultStatus; advice?: string },
  ) => Promise<unknown>;
}

/** True when the viewer is a clinician of the hub the consult was sent to. */
function canAnswerHub(consult: PatientConsult, viewer: ConsultViewer | null | undefined): boolean {
  if (consult.consultScope !== 'HUB' || !consult.targetHospitalHcode) return false;
  if (!viewer?.hospitalCode || viewer.hospitalCode !== consult.targetHospitalHcode) return false;
  if (consult.doctorId === null) return true;
  return viewer.role === 'OBSTETRICIAN' || viewer.role === 'ADMIN';
}

export function ConsultCard({
  patientId,
  consults,
  doctors,
  hub,
  viewer,
  isLoading,
  error,
  onRequestConsult,
  onUpdateConsult,
}: ConsultCardProps) {
  const [mode, setMode] = useState<'INTERNAL' | 'HUB'>('INTERNAL');
  const [doctorId, setDoctorId] = useState('');
  const [urgency, setUrgency] = useState<ConsultUrgency>('ROUTINE');
  const [reason, setReason] = useState('');
  const [adviceDrafts, setAdviceDrafts] = useState<Record<string, string>>({});
  // Which HUB consult's thread is expanded — the thread component fetches
  // (and polls) only while it is open.
  const [threadOpen, setThreadOpen] = useState<Record<string, boolean>>({});
  // Which write is in flight: 'request' or `update:{consultId}`.
  const [busy, setBusy] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const doctorFieldId = `consult-doctor-${patientId}`;
  const reasonFieldId = `consult-reason-${patientId}`;
  const urgencyFieldId = `consult-urgency-${patientId}`;

  // When the viewer belongs to a different hospital than the patient's own
  // hospital (e.g. รพ.แม่ข่าย / รพ.โหนด viewing a spoke hospital's patient),
  // they can proactively send an inbox warning/advice message directly to the
  // patient's hospital without waiting for a consult request first.
  const patientHcode = parsePatientId(patientId)?.hcode ?? '';
  const isParentHospitalViewer = Boolean(
    viewer?.hospitalCode && patientHcode && viewer.hospitalCode !== patientHcode,
  );

  // The hub mode exists when the patient's hospital has a provincial hub
  // with at least one registered consult doctor. A hospital with an EMPTY
  // own roster still reaches the hub — its doctors are the only ones the
  // form could ever offer, so it becomes the default mode.
  const noDoctors = doctors.length === 0;
  const hubModeAvailable = Boolean(hub?.available && hub.doctors.length > 0);
  const hubDoctors: ConsultDoctor[] = hub?.doctors ?? [];
  const selectedMode: 'INTERNAL' | 'HUB' =
    isParentHospitalViewer || (noDoctors && hubModeAvailable)
      ? 'HUB'
      : hubModeAvailable
        ? mode
        : 'INTERNAL';
  const modeDoctors = selectedMode === 'HUB' ? hubDoctors : doctors;

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmedReason = reason.trim();
    if (!isParentHospitalViewer && !doctorId) {
      setFormError('กรุณาเลือกแพทย์ที่ต้องการปรึกษา');
      return;
    }
    if (!trimmedReason) {
      setFormError(
        isParentHospitalViewer
          ? 'กรุณาระบุข้อความแจ้งเตือนถึงโรงพยาบาลต้นทาง'
          : 'กรุณาระบุเหตุผลที่ขอปรึกษา',
      );
      return;
    }
    setBusy('request');
    try {
      const result = (await onRequestConsult(
        isParentHospitalViewer
          ? {
              reason: trimmedReason,
              mode: 'HUB',
              urgency,
            }
          : {
              doctorId,
              reason: trimmedReason,
              mode: selectedMode,
              urgency: selectedMode === 'HUB' ? urgency : undefined,
            },
      )) as PatientConsult | undefined;
      if (isParentHospitalViewer && result?.id) {
        setThreadOpen((current) => ({ ...current, [result.id]: true }));
      }
      setDoctorId('');
      setUrgency('ROUTINE');
      setReason('');
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'ขอปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setBusy(null);
    }
  }

  async function handleUpdate(consult: PatientConsult, status: ConsultStatus) {
    setFormError(null);
    setBusy(`update:${consult.id}`);
    try {
      const advice = (adviceDrafts[consult.id] ?? consult.advice ?? '').trim();
      await onUpdateConsult(consult.id, { status, advice });
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'อัปเดตการปรึกษาไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setBusy(null);
    }
  }

  const formAvailable = isParentHospitalViewer
    ? true
    : selectedMode === 'HUB'
      ? hubModeAvailable
      : !noDoctors;

  return (
    <SectionCard
      title="ปรึกษาแพทย์ (Consult)"
      description={
        error
          ? 'ดึงข้อมูลการปรึกษาไม่สำเร็จ — ข้อมูลส่วนอื่นยังใช้ได้ตามปกติ'
          : `บันทึกการขอคำปรึกษา — ภายในโรงพยาบาล และขึ้นสู่ทีมสูติศาสตร์ของโรงพยาบาลแม่ข่าย · ${consults.length} รายการ`
      }
      testId="consult-card"
      actions={<Stethoscope aria-hidden="true" className="h-5 w-5 text-brand" />}
    >
      {isLoading && <p className="text-label text-ink-muted">กำลังโหลดข้อมูลการปรึกษา…</p>}

      {!isLoading && Boolean(error) && (
        <p role="alert" className="text-label text-danger-text">
          ไม่สามารถแสดงรายการปรึกษาได้ — กด “ลองใหม่” ที่แถบแจ้งเตือนด้านบนเพื่อดึงข้อมูลอีกครั้ง
        </p>
      )}

      {!isLoading && !error && (
        <div className="flex flex-col gap-4">
          {consults.length === 0 ? (
            <EmptyState
              title="ยังไม่มีการปรึกษา"
              description="ยังไม่มีรายการขอปรึกษาแพทย์ในการเข้าพักครั้งนี้ — ใช้ฟอร์มด้านล่างเพื่อขอคำปรึกษา"
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {consults.map((consult) => {
                const advice = adviceDrafts[consult.id] ?? consult.advice ?? '';
                const updating = busy === `update:${consult.id}`;
                const isHub = consult.consultScope === 'HUB';
                const statusLabel = isHub ? HUB_STATUS_LABEL[consult.status] : INTERNAL_STATUS_LABEL[consult.status];
                const answerer = canAnswerHub(consult, viewer);
                const threadOpenFor = threadOpen[consult.id] ?? false;
                return (
                  <li
                    key={consult.id}
                    data-testid="consult-row"
                    className="flex flex-col gap-2 rounded-xl border border-border bg-surface-card px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip tone={CONSULT_STATUS_TONE[consult.status]} label={statusLabel} />
                      {isHub && (
                        <StatusChip
                          tone={URGENCY_TONE[consult.urgencyLevel]}
                          label={URGENCY_LABEL[consult.urgencyLevel]}
                        />
                      )}
                      <span className="text-label font-semibold text-ink">{consult.doctorName}</span>
                      {consult.doctorPosition && (
                        <span className="text-caption text-ink-muted">{consult.doctorPosition}</span>
                      )}
                      {isHub && consult.targetHospitalName && (
                        <span className="text-caption text-ink-muted">
                          ที่ {consult.targetHospitalName}
                        </span>
                      )}
                      {!isHub && consult.doctorPhone && (
                        <span className="text-caption text-ink-muted">โทร {consult.doctorPhone}</span>
                      )}
                      <span className="ml-auto text-caption text-ink-muted">
                        ขอเมื่อ {fmtDateTimeTh(consult.createdAt)}
                      </span>
                    </div>

                    <p className="text-caption text-ink">
                      <span className="font-semibold">เหตุผล:</span> {consult.reason}
                    </p>

                    {consult.requestedByName && (
                      <p className="text-caption text-ink-muted">
                        ผู้ขอ: <span className="text-ink">{consult.requestedByName}</span>
                      </p>
                    )}

                    {consult.consultedAt && (
                      <p className="text-caption text-ink-muted">
                        ปรึกษาเมื่อ {fmtDateTimeTh(consult.consultedAt)}
                      </p>
                    )}

                    {consult.advice && (
                      <p className="text-caption text-ink">
                        <span className="font-semibold">คำแนะนำ:</span> {consult.advice}
                      </p>
                    )}
                    {isHub && consult.answeredByName && (
                      <p className="text-caption text-ink-muted">
                        ตอบโดย: <span className="text-ink">{consult.answeredByName}</span>
                      </p>
                    )}

                    {/* Every consult carries a thread: HUB consults are the
                        two teams talking, INTERNAL consults are the team and
                        its consulted doctor — bound to this admission's AN. */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        data-testid="consult-thread-toggle"
                        onClick={() =>
                          setThreadOpen((current) => ({
                            ...current,
                            [consult.id]: !current[consult.id],
                          }))
                        }
                        className="w-fit text-caption text-brand underline"
                      >
                        {threadOpenFor
                          ? 'ซ่อนบทสนทนา'
                          : `บทสนทนา${consult.messageCount > 0 ? ` (${consult.messageCount})` : ''}`}
                      </button>
                      {consult.unreadCount > 0 && !threadOpenFor && (
                        <span data-testid="consult-unread-badge">
                          <StatusChip tone="warn" label={`มีใหม่ ${consult.unreadCount}`} />
                        </span>
                      )}
                    </div>
                    {threadOpenFor && (
                      <ConsultThread patientId={patientId} consult={consult} viewer={viewer} />
                    )}

                    {consult.status !== 'COMPLETED' && (
                      <div className="flex flex-col gap-2 border-t border-border pt-2">
                        {/* INTERNAL: the care team records what the doctor
                            said. HUB: only the clinicians being asked see
                            the advice box; the requester just progresses. */}
                        {(!isHub || answerer) && (
                          <>
                            <label
                              htmlFor={`consult-advice-${consult.id}`}
                              className="text-caption font-semibold text-ink"
                            >
                              คำแนะนำจากแพทย์
                            </label>
                            <textarea
                              id={`consult-advice-${consult.id}`}
                              value={advice}
                              rows={2}
                              placeholder="เช่น แนะนำเฝ้าระวังความดันและปรึกษาสูติแพทย์"
                              onChange={(e) =>
                                setAdviceDrafts((current) => ({
                                  ...current,
                                  [consult.id]: e.target.value,
                                }))
                              }
                              className={fieldCls}
                            />
                          </>
                        )}
                        {isHub && !answerer && (
                          <p className="text-caption text-ink-muted">
                            รอคำตอบจากทีมสูติศาสตร์ {consult.targetHospitalName ?? 'โรงพยาบาลแม่ข่าย'} —
                            ทีมผู้ขอบันทึกความคืบหน้าได้จากปุ่มด้านล่าง
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          {consult.status === 'REQUESTED' && (!isHub || !answerer) && (
                            <Button
                              type="button"
                              disabled={updating}
                              onClick={() => void handleUpdate(consult, 'CONTACTED')}
                              className="h-8 border-border bg-surface-card px-3 text-label text-brand hover:bg-brand-soft"
                            >
                              ติดต่อแล้ว
                            </Button>
                          )}
                          {(!isHub || answerer) && (
                            <Button
                              type="button"
                              disabled={updating}
                              onClick={() => void handleUpdate(consult, 'COMPLETED')}
                              className="h-8 bg-brand px-3 text-label text-white hover:bg-brand-strong"
                            >
                              ตอบแล้ว
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {formError && (
            <p role="alert" className="text-caption text-danger-text">
              {formError}
            </p>
          )}

          {formAvailable ? (
            <form
              onSubmit={(e) => void handleRequest(e)}
              className="flex flex-col gap-2 rounded-xl border border-border bg-surface-muted px-3 py-3"
            >
              <h3 className="text-label font-semibold text-brand">
                {isParentHospitalViewer
                  ? 'ส่งข้อความแจ้งเตือนไปยังโรงพยาบาลต้นทาง (Inbox)'
                  : 'ขอคำปรึกษา'}
              </h3>

              {!isParentHospitalViewer && hubModeAvailable && (
                <div
                  role="group"
                  aria-label="ประเภทการปรึกษา"
                  className="inline-flex w-fit overflow-hidden rounded-lg border border-border bg-surface-card"
                >
                  <button
                    type="button"
                    aria-pressed={selectedMode === 'INTERNAL'}
                    onClick={() => {
                      setMode('INTERNAL');
                      setDoctorId('');
                    }}
                    className={cn(
                      'px-3 py-1.5 text-caption',
                      selectedMode === 'INTERNAL'
                        ? 'bg-brand-soft font-semibold text-brand-strong'
                        : 'text-ink-muted hover:bg-surface-muted',
                    )}
                  >
                    แพทย์ในโรงพยาบาล
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectedMode === 'HUB'}
                    onClick={() => {
                      setMode('HUB');
                      setDoctorId('');
                    }}
                    className={cn(
                      'border-l border-border px-3 py-1.5 text-caption',
                      selectedMode === 'HUB'
                        ? 'bg-brand-soft font-semibold text-brand-strong'
                        : 'text-ink-muted hover:bg-surface-muted',
                    )}
                  >
                    ทีมสูติศาสตร์ {hub?.name ?? ''}
                  </button>
                </div>
              )}

              {!isParentHospitalViewer && (
                <>
                  <label htmlFor={doctorFieldId} className="text-caption font-semibold text-ink">
                    {selectedMode === 'HUB'
                      ? `แพทย์ที่ต้องการปรึกษา (ทีมสูติศาสตร์ ${hub?.name ?? ''})`
                      : 'แพทย์ที่ต้องการปรึกษา'}
                  </label>
                  <select
                    id={doctorFieldId}
                    value={doctorId}
                    onChange={(e) => setDoctorId(e.target.value)}
                    className={fieldCls}
                  >
                    <option value="">— เลือกแพทย์ —</option>
                    {modeDoctors.map((doctor) => (
                      <option key={doctor.id} value={doctor.id}>
                        {doctor.name}
                        {doctor.position ? ` (${doctor.position})` : ''}
                      </option>
                    ))}
                  </select>
                </>
              )}

              {(selectedMode === 'HUB' || isParentHospitalViewer) && (
                <>
                  <label htmlFor={urgencyFieldId} className="text-caption font-semibold text-ink">
                    ความเร่งด่วน
                  </label>
                  <select
                    id={urgencyFieldId}
                    value={urgency}
                    onChange={(e) => setUrgency(e.target.value as ConsultUrgency)}
                    className={fieldCls}
                  >
                    <option value="ROUTINE">ปกติ</option>
                    <option value="URGENT">ด่วน</option>
                    <option value="EMERGENCY">ฉุกเฉิน</option>
                  </select>
                </>
              )}

              <label htmlFor={reasonFieldId} className="text-caption font-semibold text-ink">
                {isParentHospitalViewer
                  ? 'ข้อความแจ้งเตือน / คำแนะนำถึงโรงพยาบาลต้นทาง'
                  : 'เหตุผลที่ขอปรึกษา'}
              </label>
              <textarea
                id={reasonFieldId}
                value={reason}
                rows={2}
                maxLength={500}
                placeholder={
                  isParentHospitalViewer
                    ? 'เช่น พบความเสี่ยงจากผลประเมิน แนะนำประเมินซ้ำและเตรียมส่งต่อ'
                    : 'เช่น ความดันสูงตลอด ขอคำแนะนำจากสูติแพทย์'
                }
                onChange={(e) => setReason(e.target.value)}
                className={fieldCls}
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={busy === 'request'}
                  className="h-8 bg-brand px-3 text-label text-white hover:bg-brand-strong"
                >
                  {isParentHospitalViewer ? 'ส่งข้อความเตือน' : 'ขอปรึกษา'}
                </Button>
              </div>
            </form>
          ) : (
            <p className="text-caption text-warn-text">
              ยังไม่ได้เพิ่มรายชื่อแพทย์ที่ปรึกษาได้ — ให้ผู้ดูแลระบบเพิ่มรายชื่อของโรงพยาบาลนี้
              และของโรงพยาบาลแม่ข่าย (รพ.น่าน) ที่หน้า “ตั้งค่า → โรงพยาบาล”
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}
