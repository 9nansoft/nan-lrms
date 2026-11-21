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
  };
}

// The consult SELECT, shared by every read. `th` is the target (hub)
// hospital, joined left because INTERNAL rows have no target. The columns
// and the FROM are separate so the inbox can add its own joins.
const CONSULT_COLUMNS = `
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at`;

const CONSULT_FROM = `
      FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id`;

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
): Promise<PatientConsult[]> {
  const rows = await db.query<ConsultRow>(
    `SELECT
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at
FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id
     WHERE pc.an = ? AND pc.hospital_id = ?
     ORDER BY pc.created_at DESC`,
    [an, hospitalId],
  );
  return rows.map(toConsult);
}

export interface CreateConsultInput {
  an: string;
  hospitalId: string;
  patientId: string | null;
  journeyId: string | null;
  doctorId: string;
  reason: string;
  requestedByCid: string | null;
  requestedByName: string | null;
  /** INTERNAL (default) = the patient's hospital's own doctor; HUB = the
   *  provincial hub's registered OB-GYN team. */
  mode?: 'INTERNAL' | 'HUB';
  urgency?: ConsultUrgency;
}

export type CreateConsultResult =
  | { ok: true; consult: PatientConsult }
  | { ok: false; error: string; status: number };

function normalizeUrgency(input: ConsultUrgency | undefined): ConsultUrgency | null {
  if (input === undefined) return 'ROUTINE';
  return CONSULT_URGENCIES.includes(input) ? input : null;
}

/**
 * Record a consult request.
 *
 * INTERNAL: the doctor must be on THIS hospital's active list. HUB: the
 * doctor must be on the provincial hub's list, and the hub must exist and
 * not be the patient's own hospital. Neither flow moves the patient — that
 * is a referral, and it has its own flow (with its own permissions and its
 * own trail).
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

  const stored = await db.query<ConsultRow>(
    `SELECT
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at
FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id WHERE pc.id = ?`,
    [id],
  );
  return { ok: true, consult: toConsult(stored[0]) };
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
  const existing = await db.query<ConsultRow>(
    `SELECT
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at
FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id WHERE pc.id = ?`,
    [id],
  );
  const row = existing[0];
  if (!row) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 404 };
  }

  const isHub = (row.consult_scope ?? 'INTERNAL') === 'HUB';
  const isRequester = actor.hospitalId === row.hospital_id;
  const isTargetClinician =
    isHub &&
    actor.hospitalId === row.target_hospital_id &&
    (actor.role === 'OBSTETRICIAN' || actor.role === 'ADMIN');

  if (!isRequester && !isTargetClinician) {
    return { ok: false, error: 'ไม่มีสิทธิ์อัปเดตรายการปรึกษานี้', status: 403 };
  }

  // Only the clinicians being asked may write the advice.
  const mayWriteAdvice = !isHub || isTargetClinician;
  if (input.advice !== undefined && input.advice !== null && input.advice !== row.advice && !mayWriteAdvice) {
    return {
      ok: false,
      error: 'คำแนะนำต้องมาจากทีมแพทย์ปลายทาง — ผู้ขอบันทึกสถานะได้อย่างเดียว',
      status: 403,
    };
  }

  const status = input.status ?? (row.status as ConsultStatus) ?? 'REQUESTED';
  if (!CONSULT_STATUSES.includes(status)) {
    return { ok: false, error: 'สถานะการปรึกษาไม่ถูกต้อง', status: 400 };
  }

  let advice = input.advice === undefined ? row.advice : input.advice;
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
  const consultedAt = status === 'COMPLETED' ? row.consulted_at ?? now : row.consulted_at;
  // The hub clinician who wrote the answer is recorded, so the requester
  // knows whose advice it was.
  const answeredByName =
    isHub && isTargetClinician && (advice !== null || status === 'COMPLETED')
      ? row.answered_by_name ?? actor.name
      : row.answered_by_name;

  await db.execute(
    `UPDATE patient_consults
        SET status = ?, advice = ?, consulted_at = ?, answered_by_name = ?, updated_at = ?
      WHERE id = ?`,
    [status, advice, consultedAt, answeredByName, now, id],
  );

  if (isHub) {
    await announceConsult(db, {
      type: 'consult_updated',
      patientHospitalId: row.hospital_id,
      hubHospitalId: row.target_hospital_id,
      an: row.an,
      consultId: row.id,
    });
  }

  const stored = await db.query<ConsultRow>(
    `SELECT
    pc.id, pc.hospital_id, pc.patient_id, pc.an, pc.journey_id,
    pc.doctor_id, pc.doctor_cid, pc.doctor_name, pc.doctor_position,
    pc.doctor_phone, pc.reason, pc.status, pc.advice, pc.consult_scope,
    pc.target_hospital_id, th.name AS target_hospital_name,
    th.hcode AS target_hospital_hcode, pc.urgency_level,
    pc.answered_by_name, pc.requested_by_cid, pc.requested_by_name,
    pc.consulted_at, pc.created_at
FROM patient_consults pc
      LEFT JOIN hospitals th ON th.id = pc.target_hospital_id WHERE pc.id = ?`,
    [id],
  );
  return { ok: true, consult: toConsult(stored[0]) };
}

/**
 * Announce a HUB consult over SSE. One payload names BOTH hospitals — the
 * patient's (`hcode`, the requester's patient page listens for it) and the
 * hub's (`toHcode`, the inbox listens for it) — because eventReachesClient
 * delivers to any scoped client that can see at least one of them.
 */
async function announceConsult(
  db: DatabaseAdapter,
  event: {
    type: 'consult_requested' | 'consult_updated';
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
 *  the requesting context joined in. */
export async function listHubConsultInbox(
  db: DatabaseAdapter,
  targetHospitalId: string,
): Promise<HubConsultInboxItem[]> {
  const rows = await db.query<
    ConsultRow & {
      requester_hospital_name: string | null;
      requester_hospital_hcode: string | null;
      patient_name_encrypted: string | null;
    }
  >(
    `SELECT ${CONSULT_COLUMNS},
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
    [targetHospitalId],
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
