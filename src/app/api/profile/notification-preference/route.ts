// Per-user notification subscriptions: many hospitals, per-event opt-in
// (spec 2026-08-07-notification-events-design; supersedes the single 2026-08-05
// MOPH LINE toggle).
//
// Identity ALWAYS comes from the session (userCid + hospitalCode). The body may
// name which hospital to watch, but never who is watching — so no cross-account
// tampering — and never how much detail that hospital's alerts may carry.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { isValidCid13 } from '@/lib/cid';
import { implementedNotificationEvents, findNotificationEvent } from '@/config/notification-events';
import {
  listNotificationPreferences,
  saveNotificationPreference,
  removeNotificationPreference,
} from '@/services/notification-preference';

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  const ownHospitalCode = String(session.user.hospitalCode ?? '');
  // Same guard as PUT, and for the same reason: BMS auth can map a missing
  // user_cid to ''. Without it every user whose session lacks a CID queries the
  // SAME `user_cid = ''` row set — they would read each other's subscriptions.
  if (!isValidCid13(userCid)) {
    return NextResponse.json({ error: 'CID ของผู้ใช้ไม่ครบ 13 หลัก' }, { status: 400 });
  }
  await ensureInit();
  const db = await getDatabase();
  const preferences = await listNotificationPreferences(db, userCid);
  return NextResponse.json({
    userCid,
    ownHospitalCode,
    // Only events with a live producer — an unimplemented one rendered as a
    // checkbox would promise a notification that can never arrive.
    events: implementedNotificationEvents(),
    preferences,
  });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  const ownHospitalCode = String(session.user.hospitalCode ?? '');
  // P1-B (codex): BMS auth can map a missing user_cid to ''. A preference row
  // keyed '' is silently dropped by isValidCid at enqueue time, so the user
  // would falsely believe they opted in. Reject before any write.
  if (!isValidCid13(userCid)) {
    return NextResponse.json({ error: 'CID ของผู้ใช้ไม่ครบ 13 หลัก' }, { status: 400 });
  }
  let body: {
    hospitalCode?: unknown;
    mophLineEnabled?: unknown;
    digestHour?: unknown;
    events?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { error: 'ข้อมูลที่ส่งมาไม่ถูกต้อง — กรุณาโหลดหน้าใหม่แล้วบันทึกอีกครั้ง' },
      { status: 400 },
    );
  }
  const hospitalCode = typeof body.hospitalCode === 'string' ? body.hospitalCode.trim() : '';
  if (!hospitalCode) {
    return NextResponse.json(
      { error: 'ต้องระบุรหัสโรงพยาบาลที่ต้องการติดตาม — กรุณาเลือกโรงพยาบาลก่อนบันทึก' },
      { status: 400 },
    );
  }
  if (typeof body.mophLineEnabled !== 'boolean') {
    return NextResponse.json(
      { error: 'สถานะการรับแจ้งเตือนไม่ถูกต้อง — กรุณาโหลดหน้าใหม่แล้วบันทึกอีกครั้ง' },
      { status: 400 },
    );
  }
  const digestHour = Number(body.digestHour ?? 8);
  if (!Number.isInteger(digestHour) || digestHour < 0 || digestHour > 23) {
    return NextResponse.json(
      { error: 'เวลาสรุปรายวันต้องอยู่ระหว่าง 0-23 — กรุณาเลือกเวลาใหม่' },
      { status: 400 },
    );
  }
  const events = Array.isArray(body.events) ? (body.events as unknown[]).map(String) : [];
  const unknownEvents = events.filter((key) => !findNotificationEvent(key));
  if (unknownEvents.length > 0) {
    return NextResponse.json(
      {
        error: `ไม่รู้จักเหตุการณ์แจ้งเตือน: ${unknownEvents.join(', ')} — กรุณาโหลดหน้าใหม่แล้วเลือกจากรายการที่ระบบรองรับ`,
      },
      { status: 400 },
    );
  }
  // Cross-hospital subscription was refused between fcb6074 and this commit,
  // because alert content carried the case reference to every recipient and the
  // ANC caseRef embeds the patient's CID. It is re-opened now that the
  // guarantee is enforced end to end: detail_level is persisted per recipient
  // on moph_alert_log and buildAlertFlex omits the case reference, the patient
  // name and the deep-link for anything other than 'full'.
  // detailLevel is DERIVED, never taken from the body: 'full' means the alert
  // carries patient-level content, so it is only ever granted for the hospital
  // on the caller's own session. Reading it from the body would let anyone
  // subscribe to another hospital's patient data.
  const detailLevel = hospitalCode === ownHospitalCode ? 'full' : 'aggregate';
  await ensureInit();
  const db = await getDatabase();
  const saved = await saveNotificationPreference(db, {
    userCid,
    hospitalCode,
    mophLineEnabled: body.mophLineEnabled,
    detailLevel,
    digestHour,
    events,
  });
  return NextResponse.json(saved);
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  // Without this guard a session with no CID deletes on `user_cid = ''`, which
  // is every other CID-less user's row set.
  if (!isValidCid13(userCid)) {
    return NextResponse.json({ error: 'CID ของผู้ใช้ไม่ครบ 13 หลัก' }, { status: 400 });
  }
  const hospitalCode = new URL(request.url).searchParams.get('hospitalCode') ?? '';
  if (!hospitalCode) {
    return NextResponse.json(
      { error: 'ต้องระบุรหัสโรงพยาบาลที่ต้องการเลิกติดตาม — กรุณาเลือกโรงพยาบาลก่อนลบ' },
      { status: 400 },
    );
  }
  await ensureInit();
  const db = await getDatabase();
  // Scoped by the session CID, so a caller can only ever unwatch their own row.
  await removeNotificationPreference(db, userCid, hospitalCode);
  return NextResponse.json({ ok: true });
}
