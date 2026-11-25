// Consult messages — the thread teams talk in while a consult is open.
//
// HUB consults: the care team of the patient's hospital and the provincial
// hub's OB-GYN team see the SAME conversation. INTERNAL consults: the
// hospital's own team (including the consulted doctor, when their session
// CID is on the roster) talks among themselves. Either way the thread is
// bound to the consult, which is bound to the admission's AN — the threads
// of one patient never mix with another's.
//
// The rules this service owns:
//   1. The side rule the consult itself uses (see updatePatientConsult):
//      the requesting hospital's care team and — for HUB consults — the
//      TARGET hospital's team may READ the thread; WRITING additionally
//      requires the hub's side to be a clinician (OBSTETRICIAN / ADMIN)
//      and the consult to still be open. Once the consult is COMPLETED the
//      thread is a record — read only.
//   2. A message is clinical data of the patient. It is read and written
//      through the same patient-visibility scope as every other patient
//      resource — the service never decides who may SEE it; it does decide
//      who may join the conversation.
//   3. Every write is announced over SSE, naming the hospital(s) involved,
//      so the other side sees the message arrive live (SWR polling is the
//      fallback).
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { resolveAlertOrigin, decryptPatientName } from '@/services/alert-context';
import { enqueueConsultMessageAlert } from '@/services/risk-alert';
import { drainMophAlerts } from '@/services/moph-alert-drain';
import type { ConsultMessage, PatientConsult } from '@/types/api';
import {
  announceConsult,
  insertConsultMessage,
  loadConsultById,
  MAX_CONSULT_MESSAGE_LENGTH,
  type ConsultActor,
} from './consults';

interface MessageRow {
  id: string;
  consult_id: string;
  sender_hospital_id: string;
  sender_hospital_name: string | null;
  sender_hospital_hcode: string | null;
  sender_cid: string;
  sender_name: string;
  sender_role: string | null;
  body: string;
  message_type: string | null;
  created_at: string | Date;
}

function toIso(value: string | Date | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toMessage(row: MessageRow): ConsultMessage {
  return {
    id: row.id,
    consultId: row.consult_id,
    senderHospitalId: row.sender_hospital_id,
    senderHospitalName: row.sender_hospital_name,
    senderHospitalHcode: row.sender_hospital_hcode,
    senderCid: row.sender_cid,
    senderName: row.sender_name,
    senderRole: row.sender_role,
    body: row.body,
    messageType: row.message_type === 'SYSTEM' ? 'SYSTEM' : 'TEXT',
    createdAt: toIso(row.created_at) ?? '',
  };
}

const MESSAGE_COLUMNS = `
      SELECT cm.id, cm.consult_id, cm.sender_hospital_id,
             h.name AS sender_hospital_name, h.hcode AS sender_hospital_hcode,
             cm.sender_cid, cm.sender_name, cm.sender_role, cm.body,
             cm.message_type, cm.created_at
        FROM consult_messages cm
        LEFT JOIN hospitals h ON h.id = cm.sender_hospital_id`;

/** One thread message by id — what a successful send returns. */
async function getConsultMessage(
  db: DatabaseAdapter,
  id: string,
): Promise<ConsultMessage | null> {
  const rows = await db.query<MessageRow>(`${MESSAGE_COLUMNS} WHERE cm.id = ?`, [id]);
  return rows[0] ? toMessage(rows[0]) : null;
}

/**
 * The thread of one consult, oldest first — SYSTEM notes (the consult's own
 * status moves) sit in the stream between the human messages.
 */
export async function listConsultMessages(
  db: DatabaseAdapter,
  consultId: string,
): Promise<ConsultMessage[]> {
  const rows = await db.query<MessageRow>(
    `${MESSAGE_COLUMNS}
      WHERE cm.consult_id = ?
      ORDER BY cm.created_at ASC, cm.id ASC`,
    [consultId],
  );
  return rows.map(toMessage);
}

/**
 * What the actor may do in one consult's thread — the side rule the consult
 * itself applies. The route's patient-visibility scope has already decided
 * the actor may see this patient; this decides whether they are one of the
 * two sides talking.
 *
 *   READ  — the requesting hospital's care team, or the target (hub)
 *           hospital's team (any role: the hub's nurses follow along, the
 *           province's outside accounts do not).
 *   WRITE — one of the sides, but the hub's side must be a clinician
 *           (OBSTETRICIAN / ADMIN), exactly like answering the consult —
 *           and the consult must not be COMPLETED yet.
 */
export function consultThreadAccess(
  consult: PatientConsult,
  actor: ConsultActor,
): { mayRead: boolean; mayWrite: boolean } {
  const isHub = consult.consultScope === 'HUB';
  const isProactiveInbox = isHub && consult.doctorId === null;
  const isRequester = actor.hospitalId === consult.hospitalId;
  const isTargetHospital = isHub && actor.hospitalId === consult.targetHospitalId;
  const isTargetClinician =
    isTargetHospital &&
    (isProactiveInbox || actor.role === 'OBSTETRICIAN' || actor.role === 'ADMIN');
  return {
    mayRead: isRequester || isTargetHospital,
    mayWrite: (isRequester || isTargetClinician) && consult.status !== 'COMPLETED',
  };
}

export type CreateMessageResult =
  | { ok: true; message: ConsultMessage }
  | { ok: false; error: string; status: number };

export type MarkReadResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Stamp one person's read receipt on a consult's thread — the moment they
 * last had it open. The consult lists join against it to compute their
 * unread counts; a thread nobody opened simply counts everything.
 *
 * Reading is the same right as seeing the thread (mayRead); accounts
 * without a CID (province / system) have no identity to stamp, and marking
 * nothing for them is correct.
 */
export async function markConsultThreadRead(
  db: DatabaseAdapter,
  consultId: string,
  actor: ConsultActor,
): Promise<MarkReadResult> {
  const consult = await loadConsultById(db, consultId);
  if (!consult) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 404 };
  }
  if (!consultThreadAccess(consult, actor).mayRead) {
    return { ok: false, error: 'ไม่มีสิทธิ์เข้าบทสนทนาของคำปรึกษานี้', status: 403 };
  }
  if (!actor.userCid) {
    return { ok: true };
  }

  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO consult_thread_reads
       (id, consult_id, user_cid, last_read_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (consult_id, user_cid)
       DO UPDATE SET last_read_at = EXCLUDED.last_read_at, updated_at = EXCLUDED.updated_at`,
    [uuidv4(), consultId, actor.userCid, now, now, now],
  );
  return { ok: true };
}

/**
 * Send one message into a consult's thread — HUB (two hospitals talking) or
 * INTERNAL (the hospital's own team and its consulted doctor).
 *
 * Closed consults refuse (the thread is the record now), and anyone who is
 * not one of the sides refuses. The sender is SNAPSHOTTED from the actor:
 * identity comes from the session at send time, the message stays truthful
 * forever after.
 */
export async function createConsultMessage(
  db: DatabaseAdapter,
  consultId: string,
  actor: ConsultActor,
  input: { body: string },
): Promise<CreateMessageResult> {
  const consult = await loadConsultById(db, consultId);
  if (!consult) {
    return { ok: false, error: 'ไม่พบรายการปรึกษานี้', status: 404 };
  }

  const { mayRead, mayWrite } = consultThreadAccess(consult, actor);
  if (!mayRead) {
    return { ok: false, error: 'ไม่มีสิทธิ์เข้าบทสนทนาของคำปรึกษานี้', status: 403 };
  }
  if (!mayWrite) {
    return {
      ok: false,
      error:
        consult.status === 'COMPLETED'
          ? 'ปิดคำปรึกษาแล้ว — บทสนทนาอ่านได้อย่างเดียว'
          : 'ไม่มีสิทธิ์ส่งข้อความในบทสนทนานี้ — ฝั่งโรงพยาบาลแม่ข่ายต้องเป็นแพทย์เท่านั้น',
      status: 403,
    };
  }

  const body = input.body.trim();
  if (!body) {
    return { ok: false, error: 'พิมพ์ข้อความก่อนกดส่ง', status: 400 };
  }
  if (body.length > MAX_CONSULT_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `ข้อความยาวเกิน ${MAX_CONSULT_MESSAGE_LENGTH} ตัวอักษร`,
      status: 400,
    };
  }

  const messageId = await insertConsultMessage(db, {
    consultId: consult.id,
    senderHospitalId: actor.hospitalId,
    senderCid: actor.userCid ?? '',
    senderName: actor.name ?? 'ไม่ทราบชื่อ',
    senderRole: actor.role || null,
    body,
    messageType: 'TEXT',
  });

  logger.info('consult_message_created', {
    consultId: consult.id,
    an: consult.an,
    hospitalId: actor.hospitalId,
    role: actor.role,
  });

  await announceConsult(db, {
    type: 'consult_message',
    patientHospitalId: consult.hospitalId,
    hubHospitalId: consult.targetHospitalId,
    an: consult.an,
    consultId: consult.id,
  });

  // LINE: the other side's opted-in roster learns a message arrived (the
  // roster is CID-keyed — see enqueueConsultMessageAlert). Best effort by
  // contract: a dead notification pipeline must never fail the message.
  try {
    const senderIsRequester = actor.hospitalId === consult.hospitalId;
    const receivingHospitalId =
      consult.consultScope === 'HUB'
        ? senderIsRequester
          ? consult.targetHospitalId
          : consult.hospitalId
        : consult.hospitalId;
    if (receivingHospitalId) {
      const hcodeRows = await db.query<{ hcode: string }>(
        'SELECT hcode FROM hospitals WHERE id = ?',
        [receivingHospitalId],
      );
      const hcode = hcodeRows[0]?.hcode ?? '';
      const origin = await resolveAlertOrigin(db, receivingHospitalId, hcode);
      const patientRows = await db.query<{ name: string | null }>(
        'SELECT name FROM cached_patients WHERE hospital_id = ? AND an = ? LIMIT 1',
        [consult.hospitalId, consult.an],
      );
      const enqueued = await enqueueConsultMessageAlert(
        db,
        {
          hospitalId: receivingHospitalId,
          originHcode: hcode,
          hospitalName: origin.hospitalName,
          province: origin.province,
          caseRef: `AN ${consult.an}`,
          localDate: origin.localDate,
          patientName: decryptPatientName(patientRows[0]?.name ?? null),
          confirmUrl: null,
        },
        { messageId, excludeCid: actor.userCid },
      );
      if (enqueued > 0) {
        // Push-path drains only ride syncs and webhooks — give this message
        // a drain of its own so the LINE lands while the chat is still open.
        await drainMophAlerts(db, receivingHospitalId);
      }
    }
  } catch (error) {
    logger.warn('consult_message_alert_failed', { error });
  }

  const message = await getConsultMessage(db, messageId);
  if (!message) {
    return { ok: false, error: 'ส่งข้อความไม่สำเร็จ — ลองใหม่อีกครั้ง', status: 500 };
  }
  return { ok: true, message };
}
