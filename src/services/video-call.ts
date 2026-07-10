// Video-call signaling service — all business logic for hospital-to-hospital
// person-to-person calls (Constitution IV: business rules live in services).
//
// Media never touches this server: both participants join a Jitsi room on
// jitsi1.hosxp.net whose name is an unguessable UUID (the Jitsi instance is
// anonymous-join, so room-name entropy IS the access control). This service
// only manages the call lifecycle and pushes signaling over SSE:
//
//   ringing ──accept──▶ accepted ──end──▶ ended
//      │──decline──▶ declined
//      │──cancel───▶ cancelled
//      └──timeout──▶ missed
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import { SseManager } from '@/lib/sse';
import { listOnlineUsers } from '@/lib/presence';
import { logger } from '@/lib/logger';

export interface CallActor {
  userId: string;
  name: string;
  hospitalCode: string;
  hospitalName: string;
}

export type VideoCallErrorCode =
  | 'SELF_CALL'
  | 'CALLEE_OFFLINE'
  | 'BUSY'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_STATE';

export class VideoCallError extends Error {
  constructor(
    readonly code: VideoCallErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VideoCallError';
  }
}

export interface CreatedCall {
  callId: string;
  roomId: string;
  callee: CallActor;
}

export interface VideoCallView {
  callId: string;
  roomId: string;
  status: string;
  callerUserId: string;
  callerName: string;
  callerHospitalCode: string;
  calleeUserId: string;
  calleeName: string;
  calleeHospitalCode: string;
}

interface VideoCallRow {
  id: string;
  room_id: string;
  status: string;
  caller_user_id: string;
  caller_name: string;
  caller_hospital_code: string;
  callee_user_id: string;
  callee_name: string;
  callee_hospital_code: string;
}

const DEFAULT_RING_TIMEOUT_MS = 45_000;
// A ringing row older than this has lost its in-process timer (server
// restart/redeploy mid-ring). Treat as missed so nobody stays "busy" forever.
const STALE_RING_MS = 2 * 60_000;

// Ring timers must survive Next.js bundle duplication/HMR just like the DB
// singleton, otherwise accept() in one bundle can't clear the timer armed by
// createCall() in another.
const _global = globalThis as unknown as { __videoCallTimers?: Map<string, NodeJS.Timeout> };
const _timers: Map<string, NodeJS.Timeout> = _global.__videoCallTimers ?? new Map();
if (!_global.__videoCallTimers) _global.__videoCallTimers = _timers;

export function clearCallTimersForTests(): void {
  for (const timer of _timers.values()) clearTimeout(timer);
  _timers.clear();
}

export async function createCall(
  db: DatabaseAdapter,
  caller: CallActor,
  calleeUserId: string,
  options: { ringTimeoutMs?: number } = {},
): Promise<CreatedCall> {
  if (calleeUserId === caller.userId) {
    throw new VideoCallError('SELF_CALL', 'ไม่สามารถโทรหาตัวเองได้ กรุณาเลือกผู้ใช้ท่านอื่น');
  }

  const online = await listOnlineUsers();
  const calleePresence = online.find((user) => user.userId === calleeUserId);
  if (!calleePresence) {
    throw new VideoCallError(
      'CALLEE_OFFLINE',
      'ผู้รับสายไม่ออนไลน์อยู่ในระบบขณะนี้ กรุณาลองใหม่เมื่อผู้รับสายกลับมาออนไลน์',
    );
  }

  await expireStaleRings(db);

  const active = await db.query<{ id: string }>(
    `SELECT id FROM video_calls
      WHERE status IN ('ringing', 'accepted')
        AND (caller_user_id IN (?, ?) OR callee_user_id IN (?, ?))
      LIMIT 1`,
    [caller.userId, calleeUserId, caller.userId, calleeUserId],
  );
  if (active.length > 0) {
    throw new VideoCallError('BUSY', 'สายไม่ว่าง — มีการสนทนาค้างอยู่ กรุณาลองใหม่ภายหลัง');
  }

  const callId = uuidv4();
  const roomId = `kklrms-${uuidv4()}`;
  await db.execute(
    `INSERT INTO video_calls
       (id, room_id, caller_user_id, caller_name, caller_hospital_code,
        callee_user_id, callee_name, callee_hospital_code, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ringing', NOW())`,
    [
      callId,
      roomId,
      caller.userId,
      caller.name,
      caller.hospitalCode,
      calleeUserId,
      calleePresence.name,
      calleePresence.hospitalCode,
    ],
  );

  const ringTimeoutMs = options.ringTimeoutMs ?? DEFAULT_RING_TIMEOUT_MS;
  const timer = setTimeout(() => {
    timeoutCall(db, callId).catch((error) => {
      logger.warn('video_call_timeout_failed', { callId, error });
    });
  }, ringTimeoutMs);
  // Don't let a pending ring timer hold the process open (tests, shutdown).
  timer.unref?.();
  _timers.set(callId, timer);

  SseManager.getInstance().sendToUser(calleeUserId, 'call:invite', {
    callId,
    roomId,
    caller,
  });

  return {
    callId,
    roomId,
    callee: {
      userId: calleeUserId,
      name: calleePresence.name,
      hospitalCode: calleePresence.hospitalCode,
      hospitalName: calleePresence.hospitalName,
    },
  };
}

export async function acceptCall(
  db: DatabaseAdapter,
  callId: string,
  actor: CallActor,
): Promise<{ roomId: string }> {
  const call = await loadCall(db, callId);
  if (call.callee_user_id !== actor.userId) {
    throw new VideoCallError('FORBIDDEN', 'เฉพาะผู้รับสายเท่านั้นที่สามารถรับสายนี้ได้');
  }
  requireStatus(call, 'ringing', 'รับสาย');

  clearRingTimer(callId);
  await db.execute(`UPDATE video_calls SET status = 'accepted', answered_at = NOW() WHERE id = ?`, [
    callId,
  ]);

  const sse = SseManager.getInstance();
  sse.sendToUser(call.caller_user_id, 'call:accepted', { callId, roomId: call.room_id });
  sse.sendToUser(call.callee_user_id, 'call:resolved', { callId, status: 'accepted' });
  return { roomId: call.room_id };
}

export async function declineCall(
  db: DatabaseAdapter,
  callId: string,
  actor: CallActor,
): Promise<void> {
  const call = await loadCall(db, callId);
  if (call.callee_user_id !== actor.userId) {
    throw new VideoCallError('FORBIDDEN', 'เฉพาะผู้รับสายเท่านั้นที่สามารถปฏิเสธสายนี้ได้');
  }
  requireStatus(call, 'ringing', 'ปฏิเสธสาย');

  clearRingTimer(callId);
  await db.execute(`UPDATE video_calls SET status = 'declined', ended_at = NOW() WHERE id = ?`, [
    callId,
  ]);

  const sse = SseManager.getInstance();
  sse.sendToUser(call.caller_user_id, 'call:declined', { callId });
  sse.sendToUser(call.callee_user_id, 'call:resolved', { callId, status: 'declined' });
}

export async function cancelCall(
  db: DatabaseAdapter,
  callId: string,
  actor: CallActor,
): Promise<void> {
  const call = await loadCall(db, callId);
  if (call.caller_user_id !== actor.userId) {
    throw new VideoCallError('FORBIDDEN', 'เฉพาะผู้โทรเท่านั้นที่สามารถยกเลิกสายนี้ได้');
  }
  requireStatus(call, 'ringing', 'ยกเลิกสาย');

  clearRingTimer(callId);
  await db.execute(`UPDATE video_calls SET status = 'cancelled', ended_at = NOW() WHERE id = ?`, [
    callId,
  ]);

  SseManager.getInstance().sendToUser(call.callee_user_id, 'call:cancelled', { callId });
}

export async function endCall(
  db: DatabaseAdapter,
  callId: string,
  actor: CallActor,
): Promise<void> {
  const call = await loadCall(db, callId);
  const isParticipant =
    call.caller_user_id === actor.userId || call.callee_user_id === actor.userId;
  if (!isParticipant) {
    throw new VideoCallError('FORBIDDEN', 'เฉพาะผู้ร่วมสนทนาเท่านั้นที่สามารถวางสายนี้ได้');
  }
  requireStatus(call, 'accepted', 'วางสาย');

  await db.execute(`UPDATE video_calls SET status = 'ended', ended_at = NOW() WHERE id = ?`, [
    callId,
  ]);

  const peerUserId =
    call.caller_user_id === actor.userId ? call.callee_user_id : call.caller_user_id;
  SseManager.getInstance().sendToUser(peerUserId, 'call:ended', { callId });
}

/** Participant-guarded read used by the room page to resolve room + peer. */
export async function getCall(
  db: DatabaseAdapter,
  callId: string,
  userId: string,
): Promise<VideoCallView> {
  const call = await loadCall(db, callId);
  if (call.caller_user_id !== userId && call.callee_user_id !== userId) {
    throw new VideoCallError('FORBIDDEN', 'คุณไม่ใช่ผู้ร่วมสนทนาของสายนี้');
  }
  return {
    callId: call.id,
    roomId: call.room_id,
    status: call.status,
    callerUserId: call.caller_user_id,
    callerName: call.caller_name,
    callerHospitalCode: call.caller_hospital_code,
    calleeUserId: call.callee_user_id,
    calleeName: call.callee_name,
    calleeHospitalCode: call.callee_hospital_code,
  };
}

export interface DirectoryUser {
  userId: string;
  name: string;
  role: string;
}

export interface DirectoryHospital {
  hospitalCode: string;
  hospitalName: string;
  users: DirectoryUser[];
}

/** Online users grouped by hospital — who can be called right now. The
 *  requesting user is excluded (you cannot call yourself). */
export async function getCallDirectory(requestingUserId: string): Promise<DirectoryHospital[]> {
  const online = await listOnlineUsers();
  const byHospital = new Map<string, DirectoryHospital>();
  for (const user of online) {
    if (user.userId === requestingUserId) continue;
    let hospital = byHospital.get(user.hospitalCode);
    if (!hospital) {
      hospital = { hospitalCode: user.hospitalCode, hospitalName: user.hospitalName, users: [] };
      byHospital.set(user.hospitalCode, hospital);
    }
    hospital.users.push({ userId: user.userId, name: user.name, role: user.role });
  }
  return Array.from(byHospital.values())
    .map((hospital) => ({
      ...hospital,
      users: hospital.users.sort((a, b) => a.name.localeCompare(b.name, 'th')),
    }))
    .sort((a, b) => a.hospitalName.localeCompare(b.hospitalName, 'th'));
}

async function timeoutCall(db: DatabaseAdapter, callId: string): Promise<void> {
  _timers.delete(callId);
  // Only transition if still ringing — accept/decline/cancel may have won.
  const rows = await db.query<VideoCallRow>(
    `SELECT * FROM video_calls WHERE id = ? AND status = 'ringing'`,
    [callId],
  );
  if (rows.length === 0) return;
  const call = rows[0];

  await db.execute(`UPDATE video_calls SET status = 'missed', ended_at = NOW() WHERE id = ?`, [
    callId,
  ]);
  const sse = SseManager.getInstance();
  sse.sendToUser(call.caller_user_id, 'call:missed', { callId });
  sse.sendToUser(call.callee_user_id, 'call:resolved', { callId, status: 'missed' });
}

// Rings whose in-process timer died with a previous server process would
// otherwise keep both parties BUSY forever. Sweep them into `missed` before
// every busy check.
async function expireStaleRings(db: DatabaseAdapter): Promise<void> {
  await db.execute(
    `UPDATE video_calls SET status = 'missed', ended_at = NOW()
      WHERE status = 'ringing' AND created_at < NOW() - INTERVAL '${STALE_RING_MS / 1000} seconds'`,
  );
}

async function loadCall(db: DatabaseAdapter, callId: string): Promise<VideoCallRow> {
  const rows = await db.query<VideoCallRow>('SELECT * FROM video_calls WHERE id = ?', [callId]);
  if (rows.length === 0) {
    throw new VideoCallError('NOT_FOUND', 'ไม่พบข้อมูลสายนี้ อาจถูกยกเลิกไปแล้ว');
  }
  return rows[0];
}

function requireStatus(call: VideoCallRow, expected: string, actionThai: string): void {
  if (call.status !== expected) {
    throw new VideoCallError(
      'INVALID_STATE',
      `ไม่สามารถ${actionThai}ได้ — สายนี้อยู่ในสถานะ "${call.status}" แล้ว`,
    );
  }
}

function clearRingTimer(callId: string): void {
  const timer = _timers.get(callId);
  if (timer) {
    clearTimeout(timer);
    _timers.delete(callId);
  }
}
