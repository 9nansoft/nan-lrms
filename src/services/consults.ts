// Consults — the request a care team makes to a doctor, recorded on the
// patient's page.
//
// TWO flows share this one table:
//
//   INTERNAL (the classic flow) — the care team asks a doctor of THEIR OWN
//   hospital, from that hospital's admin-managed contact list
//   (`hospital_consult_doctors`). The contact happens offline (the doctor's
//   phone is snapshotted) and the team records the answer themselves.
//
//   HUB (the provincial consultation) — the care team of a community
//   hospital sends the question UP to the provincial hub hospital's
//   registered OB-GYN team (`target_hospital_id` = the hospital whose
//   `service_type` is PROVINCIAL_HUB). The target clinician answers IN the
//   system: authorization is the actor's BMS session CID matching the
//   addressed doctor's CID (or any clinician of the target hospital), and
//   the creation/answer are announced over SSE so the hub's inbox and the
//   requester's patient page update live. A hub clinician can already open
//   the consulted patient (a level-P hospital sees the whole province), so
//   no extra grant is needed.
//
// The rules the service owns:
//   1. A consult is recorded against ONE admission of ONE hospital. An
//      INTERNAL consult's doctor must be on THAT hospital's list; a HUB
//      consult's doctor must be on the HUB's list. Neither flow moves the
//      patient — that is a referral (its own flow, /api/referrals).
//   2. The doctor's identity is SNAPSHOTTED on the record: the contact list
//      changes, and the record must still say who was consulted that day.
//   3. A consult is clinical data of the patient. It is read and written
//      through the same patient-visibility scope as every other patient
//      resource — the service never decides who may SEE it; it does decide
//      who may ANSWER (see updatePatientConsult).
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { SseManager } from '@/lib/sse';
import { decrypt, getEncryptionKey } from '@/lib/encryption';
import { resolveAlertOrigin } from '@/services/alert-context';
import { enqueueConsultMessageAlert } from '@/services/risk-alert';
import { drainMophAlerts } from '@/services/moph-alert-drain';
import type {
  ConsultDoctor,
  ConsultHubInfo,
  ConsultStatus,
  ConsultUrgency,
  HubConsultInboxItem,
  PatientConsult,
} from '@/types/api';

/** The states a consult moves through. */
export const CONSULT_STATUSES: readonly ConsultStatus[] = [
  'REQUESTED',
  'CONTACTED',
  'COMPLETED',
];

/** The urgencies a consult may carry — the same vocabulary referrals use. */
export const CONSULT_URGENCIES: readonly ConsultUrgency[] = [
  'ROUTINE',
  'URGENT',
  'EMERGENCY',
];

/** The longest reason a consult may carry. */
export const MAX_CONSULT_REASON_LENGTH = 500;
/** The longest advice a consult may carry. */
export const MAX_CONSULT_ADVICE_LENGTH = 1000;
/** The longest one message in a consult's thread may carry. */
export const MAX_CONSULT_MESSAGE_LENGTH = 2000;

interface ConsultRow {
  id: string;
  hospital_id: string;
  patient_id: string | null;
  an: string;
  journey_id: string | null;
  doctor_id: string | null;
  doctor_cid: string;
  doctor_name: string;
  doctor_position: string | null;
  doctor_phone: string | null;
  reason: string;
  status: string;
  advice: string | null;
  consult_scope: string | null;
  target_hospital_id: string | null;
  target_hospital_name: string | null;
  target_hospital_hcode: string | null;
  urgency_level: string | null;
  answered_by_name: string | null;
  requested_by_cid: string | null;
  requested_by_name: string | null;
  consulted_at: string | Date | null;
  created_at: string | Date;
  // Subquery in CONSULT_COLUMNS — the thread's human message count. COUNT
  // may arrive as a string depending on the driver, so it is normalized.
  message_count: string | number | null;
  // Appended by consultUnreadSubquery when a viewer CID is given.
  unread_count: string | number | null;
}

interface DoctorRow {
  id: string;
  cid: string;
  name: string;
  position: string | null;
  phone_number: string | null;
}

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toConsult(row: ConsultRow): PatientConsult {
  return {
    id: row.id,
    an: row.an,
    hospitalId: row.hospital_id,
    doctorId: row.doctor_id,
    doctorCid: row.doctor_cid,
    doctorName: row.doctor_name,
    doctorPosition: row.doctor_position,
    doctorPhone: row.doctor_phone,
    reason: row.reason,
    status: (row.status as ConsultStatus) ?? 'REQUESTED',
    advice: row.advice,
    consultScope: (row.consult_scope as PatientConsult['consultScope']) ?? 'INTERNAL',
    targetHospitalId: row.target_hospital_id,
    targetHospitalName: row.target_hospital_name,
    targetHospitalHcode: row.target_hospital_hcode,
    urgencyLevel: (row.urgency_level as ConsultUrgency) ?? 'ROUTINE',
    answeredByName: row.answered_by_name,
    requestedByCid: row.requested_by_cid,
    requestedByName: row.requested_by_name,
    consultedAt: toIso(row.consulted_at),
    createdAt: toIso(row.created_at) ?? '',
    messageCount: Number(row.message_count ?? 0),
    unreadCount: Number(row.unread_count ?? 0),
  };
}

// The consult SELECT, shared by every read. `th` is the target (hub)
// hospital, joined left because INTERNAL rows have no target. The columns
// and the FROM are separate so the inbox can add its own joins. The trailing
// subquery counts the thread's human messages (SYSTEM notes excluded — the
// status is already visible on the row itself).
const CONSULT_COLUMNS = `
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at,
    (SELECT COUNT(*) FROM consult_messages cm
      WHERE cm.consult_id = pc.id AND cm.message_type = 'TEXT') AS message_count`;

const CONSULT_FROM = `
      FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id`;

/**
 * The per-viewer unread count, appended to CONSULT_COLUMNS when the viewer
 * has a CID: TEXT messages newer than that person's last visit to the
 * thread (a read receipt nobody wrote yet means everything counts).
 */
function consultUnreadSubquery(viewerCid: string | null): string {
  if (!viewerCid) return ', 0 AS unread_count';
  return `,
    (SELECT COUNT(*) FROM consult_messages cm
      WHERE cm.consult_id = pc.id AND cm.message_type = 'TEXT'
        AND cm.created_at > COALESCE(
          (SELECT r.last_read_at FROM consult_thread_reads r
            WHERE r.consult_id = pc.id AND r.user_cid = ?),
          '1970-01-01')) AS unread_count`;
}

/**
 * One consult by id — the shared read the service re-selects through after
 * every write, and the thread service loads the consult through.
 *
 * No hospital scope inside the query: AN-keyed reads filter by (an,
 * hospital) themselves, and id-keyed callers must check the row's admission
 * against their own scope before trusting it.
 */
export async function loadConsultById(
  db: DatabaseAdapter,
  id: string,
): Promise<PatientConsult | null> {
  const rows = await db.query<ConsultRow>(
    `SELECT ${CONSULT_COLUMNS}
       ${CONSULT_FROM}
      WHERE pc.id = ?`,
    [id],
  );
  return rows[0] ? toConsult(rows[0]) : null;
}

/**
 * The admission a consult belongs to.
 *
 * The patient row decides the hospital: ANs are hospital-local, so the URL's
 * hospital code is a hint, never the authority.
 */
export async function resolveConsultTarget(
  db: DatabaseAdapter,
  an: string,
  hcode: string,
): Promise<{ id: string; hospital_id: string; journey_id: string | null } | null> {
  const patients = await db.query<{
    id: string;
    hospital_id: string;
    journey_id: string | null;
  }>(
    `SELECT cp.id, cp.hospital_id, cp.journey_id
       FROM cached_patients cp
       JOIN hospitals h ON h.id = cp.hospital_id
      WHERE cp.an = ? AND h.hcode = ?
      LIMIT 1`,
    [an, hcode],
  );
  return patients[0] ?? null;
}

/**
 * The provincial hub a hospital's HUB consults go up to — the active
 * `PROVINCIAL_HUB` of the same province. Null when the hospital IS the hub
 * (its consults stay INTERNAL) or no hub is registered.
 */
export async function resolveConsultHub(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<{ id: string; hcode: string; name: string } | null> {
  const rows = await db.query<{ id: string; hcode: string; name: string }>(
    `SELECT id, hcode, name
       FROM hospitals
      WHERE service_type = 'PROVINCIAL_HUB'
        AND is_active = true
        AND id <> ?
        AND province_code = (SELECT province_code FROM hospitals WHERE id = ?)
      LIMIT 1`,
    [hospitalId, hospitalId],
  );
  return rows[0] ?? null;
}

/**
 * The doctors of one hospital that can be consulted — the active ones, in
 * the order the admin listed them. Used for the patient's own hospital
 * (INTERNAL) and, with the hub's id, for the hub's OB-GYN roster (HUB).
 */
export async function listConsultDoctors(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<ConsultDoctor[]> {
  const rows = await db.query<DoctorRow>(
    `SELECT id, cid, name, position, phone_number
       FROM hospital_consult_doctors
      WHERE hospital_id = ? AND is_active = true
      ORDER BY name ASC`,
    [hospitalId],
  );
  return rows.map((row) => ({
    id: row.id,
    cid: row.cid,
    name: row.name,
    position: row.position,
    phoneNumber: row.phone_number,
  }));
}

/**
 * The hub a patient's hospital consults up to, with its registered doctors —
 * what the request form needs to offer (or hide) the HUB mode.
 */
export async function consultHubInfoFor(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<ConsultHubInfo | null> {
  const hub = await resolveConsultHub(db, hospitalId);
  if (!hub) return null;
  const doctors = await listConsultDoctors(db, hub.id);
  return { hcode: hub.hcode, name: hub.name, available: doctors.length > 0, doctors };
}

/**
 * The consults of one admission, newest first — both INTERNAL and HUB.
 *
 * The hospital scope is part of the query: ANs are hospital-local, so an
 * unscoped read could return another hospital's row for a colliding AN.
 */
export async function listPatientConsults(
  db: DatabaseAdapter,
  an: string,
  hospitalId: string,
  viewerCid: string | null = null,
): Promise<PatientConsult[]> {
  const rows = await db.query<ConsultRow>(
    `SELECT ${CONSULT_COLUMNS}${consultUnreadSubquery(viewerCid)}
       ${CONSULT_FROM}
     WHERE pc.an = ? AND pc.hospital_id = ?
     ORDER BY pc.created_at DESC`,
    viewerCid ? [viewerCid, an, hospitalId] : [an, hospitalId],
  );
  return rows.map(toConsult);
}

export interface CreateConsultInput {
  an: string;
  hospitalId: string;
  patientId: string | null;
  journeyId: string | null;
  doctorId?: string | null;
  reason: string;
  requestedByCid: string | null;
  requestedByName: string | null;
  /** INTERNAL (default) = the patient's hospital's own doctor; HUB = the
   *  provincial hub's registered OB-GYN team (or proactive warning from a
   *  parent hospital to the patient's hospital). */
  mode?: 'INTERNAL' | 'HUB';
  urgency?: ConsultUrgency;
  /** Parent hospital id when a parent hospital (รพ.แม่ข่าย) proactively
   *  inboxes the patient's hospital without waiting for a consult request. */
  actorHospitalId?: string | null;
  actorRole?: string | null;
}

export type CreateConsultResult =
  | { ok: true; consult: PatientConsult }
  | { ok: false; error: string; status: number };

function normalizeUrgency(input: ConsultUrgency | undefined): ConsultUrgency | null {
  if (input === undefined) return 'ROUTINE';
  return CONSULT_URGENCIES.includes(input) ? input : null;
}

/**
 * Record a consult request — or a proactive inbox warning initiated by a
 * parent hospital (รพ.แม่ข่าย) to the patient's hospital (รพ.ของคนไข้).
 *
 * INTERNAL: the doctor must be on THIS hospital's active list. HUB: the
 * doctor must be on the provincial hub's list (or, when initiated proactively
 * by a parent hospital without a doctorId, the parent hospital itself opens
 * the HUB thread and sends the first message immediately).
 */
export async function createPatientConsult(
  db: DatabaseAdapter,
  input: CreateConsultInput,
): Promise<CreateConsultResult> {
  const reason = input.reason.trim();
  if (!reason) {
    return { ok: false, error: 'ต้องระบุเหตุผลที่ขอปรึกษา', status: 400 };
  }
  if (reason.length > MAX_CONSULT_REASON_LENGTH) {
    return {
      ok: false,
      error: `เหตุผลยาวเกิน ${MAX_CONSULT_REASON_LENGTH} ตัวอักษร`,
      status: 400,
    };
  }

  const urgency = normalizeUrgency(input.urgency);
  if (urgency === null) {
    return { ok: false, error: 'ระดับความเร่งด่วนไม่ถูกต้อง', status: 400 };
  }

  const trimmedDoctorId = (input.doctorId ?? '').trim();
  const isProactiveParentInbox =
    !trimmedDoctorId &&
    Boolean(input.actorHospitalId && input.actorHospitalId !== input.hospitalId);

  if (isProactiveParentInbox) {
    const parentHospitals = await db.query<{ id: string; hcode: string; name: string }>(
      'SELECT id, hcode, name FROM hospitals WHERE id = ? AND is_active = true LIMIT 1',
      [input.actorHospitalId],
    );
    const parentHospital = parentHospitals[0];
    if (!parentHospital) {
      return {
        ok: false,
        error: 'ไม่พบข้อมูลโรงพยาบาลแม่ข่ายของผู้ส่งข้อความ',
        status: 400,
      };
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    const senderName = input.requestedByName?.trim() || `ทีมสูติศาสตร์ ${parentHospital.name}`;
    const senderCid = input.requestedByCid ?? '';

    await db.execute(
      `INSERT INTO patient_consults
         (id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
          doctor_name, doctor_position, doctor_phone, reason, status,
          consult_scope, target_hospital_id, urgency_level,
          requested_by_cid, requested_by_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 'โรงพยาบาลแม่ข่าย', NULL, ?, 'CONTACTED', 'HUB', ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.hospitalId,
        input.patientId,
        input.an,
        input.journeyId,
        senderCid,
        senderName,
        reason,
        parentHospital.id,
        urgency,
        input.requestedByCid,
        input.requestedByName,
        now,
        now,
      ],
    );

    const messageId = await insertConsultMessage(db, {
      consultId: id,
      senderHospitalId: parentHospital.id,
      senderCid,
      senderName,
      senderRole: input.actorRole ?? null,
      body: reason,
      messageType: 'TEXT',
    });

    if (senderCid) {
      const readTime = new Date(Date.now() + 1).toISOString();
      await db.execute(
        `INSERT INTO consult_thread_reads
           (id, consult_id, user_cid, last_read_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (consult_id, user_cid)
           DO UPDATE SET last_read_at = EXCLUDED.last_read_at, updated_at = EXCLUDED.updated_at`,
        [uuidv4(), id, senderCid, readTime, readTime, readTime],
      );
    }

    logger.info('patient_consult_proactive_inbox_created', {
      hospitalId: input.hospitalId,
      targetHospitalId: parentHospital.id,
      an: input.an,
      urgency,
    });

    await announceConsult(db, {
      type: 'consult_message',
      patientHospitalId: input.hospitalId,
      hubHospitalId: parentHospital.id,
      an: input.an,
      consultId: id,
    });

    // Notify ONLY the patient's hospital (รพช.) via BMS / LINE OA หมอพร้อม + in-app alert.
    // The sender (โรงพยาบาลต้นทาง) is the parent hospital (รพ.แม่ข่าย), NOT รพช.!
    try {
      const hcodeRows = await db.query<{ hcode: string; name: string }>(
        'SELECT hcode, name FROM hospitals WHERE id = ? LIMIT 1',
        [input.hospitalId],
      );
      const patientHcode = hcodeRows[0]?.hcode ?? '';
      const patientHospitalName = hcodeRows[0]?.name ?? patientHcode;
      const origin = await resolveAlertOrigin(db, input.hospitalId, patientHcode);
      const patientRows = await db.query<{ name: string | null }>(
        'SELECT name FROM cached_patients WHERE hospital_id = ? AND an = ? LIMIT 1',
        [input.hospitalId, input.an],
      );
      const enqueued = await enqueueConsultMessageAlert(
        db,
        {
          hospitalId: input.hospitalId,
          originHcode: parentHospital.hcode,
          hospitalName: parentHospital.name,
          province: origin.province,
          caseRef: patientHospitalName
            ? `AN ${input.an} (${patientHospitalName})`
            : `AN ${input.an}`,
          localDate: origin.localDate,
          patientName: decryptPatientName(patientRows[0]?.name ?? null),
          confirmUrl: patientHcode ? `/patients/${patientHcode}-${input.an}` : null,
        },
        {
          messageId,
          excludeCid: input.requestedByCid,
          excludeHospitalId: parentHospital.id,
          titleOverride: `แจ้งเตือนคำปรึกษาจาก ${parentHospital.name} — AN ${input.an}`,
        },
      );
      if (enqueued > 0) {
        await drainMophAlerts(db, input.hospitalId);
      }
    } catch (error) {
      logger.warn('proactive_consult_alert_failed', { error });
    }

    const stored = await loadConsultById(db, id);
    if (!stored) {
      return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 500 };
    }
    const reRead = await listPatientConsults(db, input.an, input.hospitalId, input.requestedByCid);
    const matched = reRead.find((c) => c.id === id);
    return { ok: true, consult: matched ?? stored };
  }

  const mode = input.mode ?? 'INTERNAL';

  // The hospital the addressed doctor's list is read from: the patient's own
  // hospital (INTERNAL) or the provincial hub (HUB).
  let listHospitalId = input.hospitalId;
  let targetHospitalId: string | null = null;
  let hubHcode: string | null = null;

  if (mode === 'HUB') {
    const hub = await resolveConsultHub(db, input.hospitalId);
    if (!hub) {
      return {
        ok: false,
        error: 'โรงพยาบาลของผู้ป่วยไม่มีโรงพยาบาลแม่ข่ายที่ปรึกษาขึ้นได้',
        status: 400,
      };
    }
    listHospitalId = hub.id;
    targetHospitalId = hub.id;
    hubHcode = hub.hcode;
  }

  const doctors = await db.query<DoctorRow>(
    `SELECT id, cid, name, position, phone_number
       FROM hospital_consult_doctors
      WHERE id = ? AND hospital_id = ? AND is_active = true`,
    [input.doctorId, listHospitalId],
  );
  const doctor = doctors[0];
  if (!doctor) {
    return {
      ok: false,
      error:
        mode === 'HUB'
          ? 'ไม่พบแพทย์ที่ปรึกษาได้ในรายชื่อของโรงพยาบาลแม่ข่าย'
          : 'ไม่พบแพทย์ที่ปรึกษาได้ในรายชื่อของโรงพยาบาลนี้',
      status: 400,
    };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO patient_consults
       (id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
        doctor_name, doctor_position, doctor_phone, reason, status,
        consult_scope, target_hospital_id, urgency_level,
        requested_by_cid, requested_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.hospitalId,
      input.patientId,
      input.an,
      input.journeyId,
      doctor.id,
      doctor.cid,
      doctor.name,
      doctor.position,
      doctor.phone_number,
      reason,
      mode,
      targetHospitalId,
      urgency,
      input.requestedByCid,
      input.requestedByName,
      now,
      now,
    ],
  );

  logger.info('patient_consult_created', {
    hospitalId: input.hospitalId,
    an: input.an,
    doctorCid: doctor.cid,
    mode,
    urgency,
  });

  if (mode === 'HUB' && hubHcode) {
    await announceConsult(db, {
      type: 'consult_requested',
      patientHospitalId: input.hospitalId,
      hubHospitalId: targetHospitalId,
      an: input.an,
      consultId: id,
    });
  }

  const stored = await loadConsultById(db, id);
  if (!stored) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 500 };
  }
  return { ok: true, consult: stored };
}

export interface UpdateConsultInput {
  status?: ConsultStatus;
  advice?: string | null;
}

/** Who is touching the consult — from the session, resolved by the route. */
export interface ConsultActor {
  /** The actor's OWN hospital id (from their session's hospital code). */
  hospitalId: string;
  role: string;
  userCid: string | null;
  name: string | null;
}

/**
 * Move a consult on: mark it reached, answered, and write down what the
 * doctor said.
 *
 * Who may write what:
 *   - INTERNAL: the consult belongs to the patient's hospital — only that
 *     hospital's care team touches it (they record the doctor's answer).
 *   - HUB: the REQUESTING hospital moves the request on (status only — the
 *     advice must come from the doctors being asked), and the TARGET
 *     hospital's clinicians (OB-GYN / admin) write the advice and complete
 *     it. Anyone else is refused.
 */
export async function updatePatientConsult(
  db: DatabaseAdapter,
  id: string,
  actor: ConsultActor,
  input: UpdateConsultInput,
): Promise<{ ok: true; consult: PatientConsult } | { ok: false; error: string; status: number }> {
  const existing = await loadConsultById(db, id);
  if (!existing) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 404 };
  }

  const isHub = existing.consultScope === 'HUB';
  const isProactiveInbox = isHub && existing.doctorId === null;
  const isRequester = actor.hospitalId === existing.hospitalId;
  const isTargetClinician =
    isHub &&
    actor.hospitalId === existing.targetHospitalId &&
    (isProactiveInbox || actor.role === 'OBSTETRICIAN' || actor.role === 'ADMIN');

  if (!isRequester && !isTargetClinician) {
    return { ok: false, error: 'ไม่มีสิทธิ์อัปเดตรายการปรึกษานี้', status: 403 };
  }

  // Type 1 (รพช. -> รพ.แม่ข่าย, doctorId !== null): only the hub clinicians write advice.
  // Type 2 (รพ.แม่ข่าย -> รพช., doctorId === null): รพช. (isRequester) answers back.
  const mayWriteAdvice = !isHub || isProactiveInbox || isTargetClinician;
  if (
    input.advice !== undefined &&
    input.advice !== null &&
    input.advice !== existing.advice &&
    !mayWriteAdvice
  ) {
    return {
      ok: false,
      error: 'คำแนะนำต้องมาจากทีมแพทย์ปลายทาง — ผู้ขอบันทึกสถานะได้อย่างเดียว',
      status: 403,
    };
  }

  const status = input.status ?? existing.status;
  if (!CONSULT_STATUSES.includes(status)) {
    return { ok: false, error: 'สถานะการปรึกษาไม่ถูกต้อง', status: 400 };
  }

  let advice = input.advice === undefined ? existing.advice : input.advice;
  if (advice !== null && advice !== undefined) {
    advice = advice.trim();
    if (advice.length > MAX_CONSULT_ADVICE_LENGTH) {
      return {
        ok: false,
        error: `คำแนะนำยาวเกิน ${MAX_CONSULT_ADVICE_LENGTH} ตัวอักษร`,
        status: 400,
      };
    }
    if (advice === '') advice = null;
  }

  const now = new Date().toISOString();
  // The consult is "done" the moment it is answered.
  const consultedAt = status === 'COMPLETED' ? existing.consultedAt ?? now : existing.consultedAt;
  // The hub clinician who wrote the answer is recorded, so the requester
  // knows whose advice it was.
  const answeredByName =
    isHub && (isTargetClinician || (isProactiveInbox && isRequester)) && (advice !== null || status === 'COMPLETED')
      ? existing.answeredByName ?? actor.name
      : existing.answeredByName;

  await db.execute(
    `UPDATE patient_consults
        SET status = ?, advice = ?, consulted_at = ?, answered_by_name = ?, updated_at = ?
      WHERE id = ?`,
    [status, advice, consultedAt, answeredByName, now, id],
  );

  // The thread records the consult's own moves: a HUB consult that actually
  // changed state gets a SYSTEM note, so the conversation reads as the
  // complete record of the case.
  if (isHub && status !== existing.status) {
    await insertConsultMessage(db, {
      consultId: id,
      senderHospitalId: actor.hospitalId,
      senderCid: actor.userCid ?? '',
      senderName: actor.name ?? 'ระบบ',
      senderRole: actor.role,
      body: consultSystemNote(status, actor.name),
      messageType: 'SYSTEM',
    });
  }

  if (isHub) {
    await announceConsult(db, {
      type: 'consult_updated',
      patientHospitalId: existing.hospitalId,
      hubHospitalId: existing.targetHospitalId,
      an: existing.an,
      consultId: existing.id,
    });
  }

  const stored = await loadConsultById(db, id);
  if (!stored) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 500 };
  }
  return { ok: true, consult: stored };
}

/**
 * Append one row to a consult's thread — a human message or the consult's
 * own status note. The sender is a snapshot taken from the caller-resolved
 * actor; the consult id is trusted (callers load the consult first).
 */
export async function insertConsultMessage(
  db: DatabaseAdapter,
  input: {
    consultId: string;
    senderHospitalId: string;
    senderCid: string;
    senderName: string;
    senderRole: string | null;
    body: string;
    messageType: 'TEXT' | 'SYSTEM';
  },
): Promise<string> {
  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO consult_messages
       (id, consult_id, sender_hospital_id, sender_cid, sender_name,
        sender_role, body, message_type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.consultId,
      input.senderHospitalId,
      input.senderCid,
      input.senderName,
      input.senderRole,
      input.body,
      input.messageType,
      now,
      now,
    ],
  );
  return id;
}

/** The SYSTEM note a HUB consult's thread records when its state moves. */
function consultSystemNote(status: ConsultStatus, actorName: string | null): string {
  const base: Record<ConsultStatus, string> = {
    REQUESTED: 'คำปรึกษาถูกเปิดขึ้นใหม่ — รอคำตอบ',
    CONTACTED: 'กำลังปรึกษา — เปิดบทสนทนาให้ทั้งสองฝั่งโต้ตอบได้',
    COMPLETED: 'ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว',
  };
  return actorName ? `${base[status]} (โดย ${actorName})` : base[status];
}

/**
 * Announce a HUB consult over SSE. One payload names BOTH hospitals — the
 * patient's (`hcode`, the requester's patient page listens for it) and the
 * hub's (`toHcode`, the inbox listens for it) — because eventReachesClient
 * delivers to any scoped client that can see at least one of them. The
 * thread service reuses it to announce each new message.
 */
export async function announceConsult(
  db: DatabaseAdapter,
  event: {
    type: 'consult_requested' | 'consult_updated' | 'consult_message';
    patientHospitalId: string;
    hubHospitalId: string | null;
    an: string;
    consultId: string;
  },
): Promise<void> {
  try {
    const ids = [event.patientHospitalId, event.hubHospitalId].filter(
      (id): id is string => Boolean(id),
    );
    if (ids.length === 0) return;
    const placeholders = ids.map(() => '?').join(', ');
    const hospitals = await db.query<{ id: string; hcode: string }>(
      `SELECT id, hcode FROM hospitals WHERE id IN (${placeholders})`,
      ids,
    );
    const hcode = hospitals.find((h) => h.id === event.patientHospitalId)?.hcode ?? null;
    const toHcode = hospitals.find((h) => h.id === event.hubHospitalId)?.hcode ?? null;
    if (!hcode && !toHcode) return;
    SseManager.getInstance().broadcast('patient-update', {
      type: event.type,
      hcode,
      toHcode,
      consultId: event.consultId,
      an: event.an,
    });
  } catch (error) {
    // A dead SSE stream must never fail the consult write.
    logger.warn('consult_sse_broadcast_failed', { error });
  }
}

/** The HUB consults addressed to one hospital's OB team, newest first, with
 *  the requesting context joined in. `viewerCid` makes each row carry that
 *  person's unread count. */
export async function listHubConsultInbox(
  db: DatabaseAdapter,
  targetHospitalId: string,
  viewerCid: string | null = null,
): Promise<HubConsultInboxItem[]> {
  const rows = await db.query<
    ConsultRow & {
      requester_hospital_name: string | null;
      requester_hospital_hcode: string | null;
      patient_name_encrypted: string | null;
    }
  >(
    `SELECT ${CONSULT_COLUMNS}${consultUnreadSubquery(viewerCid)},
           h.name AS requester_hospital_name,
           h.hcode AS requester_hospital_hcode,
           cp.name AS patient_name_encrypted
       FROM patient_consults pc
       JOIN hospitals h ON h.id = pc.hospital_id
       LEFT JOIN hospitals th ON th.id = pc.target_hospital_id
       LEFT JOIN cached_patients cp ON cp.id = pc.patient_id
      WHERE pc.consult_scope = 'HUB' AND pc.target_hospital_id = ?
      ORDER BY pc.created_at DESC
      LIMIT 200`,
    viewerCid ? [viewerCid, targetHospitalId] : [targetHospitalId],
  );
  return rows.map((row) => {
    const consult = toConsult(row);
    return {
      ...consult,
      patientName: decryptPatientName(row.patient_name_encrypted),
      patientUrlId: row.requester_hospital_hcode
        ? `${row.requester_hospital_hcode}-${row.an}`
        : row.an,
      requesterHospitalName: row.requester_hospital_name ?? '',
    };
  });
}

/** How many HUB consults of one hospital are still waiting for an answer. */
export async function countPendingHubConsults(
  db: DatabaseAdapter,
  targetHospitalId: string,
): Promise<number> {
  const rows = await db.query<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM patient_consults
      WHERE consult_scope = 'HUB' AND target_hospital_id = ? AND status <> 'COMPLETED'`,
    [targetHospitalId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** The patient name is encrypted at rest — decrypt it for the inbox, failing
 *  open to null (the row still shows its AN). */
function decryptPatientName(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    const key = getEncryptionKey();
    if (!key) return null;
    return decrypt(encrypted, key);
  } catch {
    return null;
  }
}
