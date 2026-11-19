// Consults — the request a care team makes to a doctor, recorded on the
// patient's page.
//
// The DOCTORS come from `hospital_consult_doctors` (the admin-managed contact
// list of each hospital). This service owns the CONSULT records: who was
// asked, why, and what came back.
//
// The rules it owns:
//   1. A consult is recorded against ONE admission of ONE hospital. The
//      doctor must be on THAT hospital's list — asking another hospital's
//      doctor is a referral, not a consult.
//   2. The doctor's name is SNAPSHOTTED on the record: the contact list
//      changes (a doctor leaves), and the record must still say who was
//      consulted that day.
//   3. A consult is clinical data of the patient. It is read and written
//      through the same patient-visibility scope as every other patient
//      resource — the service never decides who may see it.
//
// A consult is NOT a referral: a referral moves the patient to another
// hospital, a consult asks a doctor for advice about a patient who stays
// here. The referral flow lives in /api/referrals.
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import type {
  ConsultDoctor,
  ConsultStatus,
  PatientConsult,
} from '@/types/api';

/** The states a consult moves through. */
export const CONSULT_STATUSES: readonly ConsultStatus[] = [
  'REQUESTED',
  'CONTACTED',
  'COMPLETED',
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
    requestedByCid: row.requested_by_cid,
    requestedByName: row.requested_by_name,
    consultedAt: toIso(row.consulted_at),
    createdAt: toIso(row.created_at) ?? '',
  };
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
 * The doctors of one hospital that can be consulted — the active ones, in
 * the order the admin listed them.
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
 * The consults of one admission, newest first.
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
    `SELECT id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
            doctor_name, doctor_position, doctor_phone, reason, status, advice,
            requested_by_cid, requested_by_name, consulted_at, created_at
       FROM patient_consults
      WHERE an = ? AND hospital_id = ?
      ORDER BY created_at DESC`,
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
}

export type CreateConsultResult =
  | { ok: true; consult: PatientConsult }
  | { ok: false; error: string; status: number };

/**
 * Record a consult request.
 *
 * The doctor must be on THIS hospital's active list. A doctor of another
 * hospital is refused: sending a patient elsewhere is a referral, and it
 * has its own flow (with its own permissions and its own trail).
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

  const doctors = await db.query<DoctorRow>(
    `SELECT id, cid, name, position, phone_number
       FROM hospital_consult_doctors
      WHERE id = ? AND hospital_id = ? AND is_active = true`,
    [input.doctorId, input.hospitalId],
  );
  const doctor = doctors[0];
  if (!doctor) {
    return {
      ok: false,
      error: 'ไม่พบแพทย์ที่ปรึกษาได้ในรายชื่อของโรงพยาบาลนี้',
      status: 400,
    };
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO patient_consults
       (id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
        doctor_name, doctor_position, doctor_phone, reason, status,
        requested_by_cid, requested_by_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REQUESTED', ?, ?, ?, ?)`,
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
  });

  const stored = await db.query<ConsultRow>(
    `SELECT id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
            doctor_name, doctor_position, doctor_phone, reason, status, advice,
            requested_by_cid, requested_by_name, consulted_at, created_at
       FROM patient_consults WHERE id = ?`,
    [id],
  );
  return { ok: true, consult: toConsult(stored[0]) };
}

export interface UpdateConsultInput {
  status?: ConsultStatus;
  advice?: string | null;
}

/**
 * Move a consult on: mark it reached, answered, and write down what the
 * doctor said.
 *
 * The hospital scope is part of the UPDATE: a consult of another hospital is
 * not found here, so it cannot be touched from this one.
 */
export async function updatePatientConsult(
  db: DatabaseAdapter,
  id: string,
  hospitalId: string,
  input: UpdateConsultInput,
): Promise<{ ok: true; consult: PatientConsult } | { ok: false; error: string; status: number }> {
  const existing = await db.query<ConsultRow>(
    `SELECT id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
            doctor_name, doctor_position, doctor_phone, reason, status, advice,
            requested_by_cid, requested_by_name, consulted_at, created_at
       FROM patient_consults WHERE id = ? AND hospital_id = ?`,
    [id, hospitalId],
  );
  const row = existing[0];
  if (!row) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 404 };
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
  await db.execute(
    `UPDATE patient_consults
        SET status = ?, advice = ?, consulted_at = ?, updated_at = ?
      WHERE id = ? AND hospital_id = ?`,
    [status, advice, consultedAt, now, id, hospitalId],
  );

  const stored = await db.query<ConsultRow>(
    `SELECT id, hospital_id, patient_id, an, journey_id, doctor_id, doctor_cid,
            doctor_name, doctor_position, doctor_phone, reason, status, advice,
            requested_by_cid, requested_by_name, consulted_at, created_at
       FROM patient_consults WHERE id = ?`,
    [id],
  );
  return { ok: true, consult: toConsult(stored[0]) };
}
