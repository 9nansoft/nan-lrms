// POST /api/profile/notification-test — the profile page's "ทดสอบส่งข้อความ"
// button. Sends ONE test LINE to the SESSION user's own CID and returns the
// outcome inline (ok/detail/messageId), so delivery problems surface in the
// user's hand instead of silently eating real alerts.
//
// Identity comes from the session only (same contract as
// /api/profile/notification-preference): a client cannot aim a test at
// somebody else's CID. The route is thin — transport choice, session
// resolution, and the send live in src/services/notification-test.ts
// (constitution IV: business rules never in route handlers).
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { isValidCid13 } from '@/lib/cid';
import { sendSelfTestNotification } from '@/services/notification-test';

export async function POST(_request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const userCid = String(session.user.userCid ?? '');
  // Same guard as the preference routes: without it, a CID-less session would
  // self-test on an invalid recipient and read as a pipeline failure.
  if (!isValidCid13(userCid)) {
    return NextResponse.json({ error: 'CID ของผู้ใช้ไม่ครบ 13 หลัก' }, { status: 400 });
  }
  await ensureInit();
  const db = await getDatabase();
  const result = await sendSelfTestNotification(db, {
    cid: userCid,
    name: String(session.user.name ?? ''),
    hospitalCode: String(session.user.hospitalCode ?? ''),
  });
  // 200 even when result.ok is false: the send-level outcome (config gap,
  // template rejected, no tunnel) IS the response payload — the UI renders
  // result.detail verbatim under the button.
  return NextResponse.json(result);
}
