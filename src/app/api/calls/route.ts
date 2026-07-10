// POST /api/calls — place a video call to a specific online user.
// Auth: any signed-in session. The service enforces presence, busy and
// self-call rules; media is carried by Jitsi, not this server.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { createCall } from '@/services/video-call';
import { actorFromSession, videoCallErrorResponse } from '@/lib/video-call-http';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { calleeUserId?: unknown } | null = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const calleeUserId = typeof body?.calleeUserId === 'string' ? body.calleeUserId : '';
  if (!calleeUserId) {
    return NextResponse.json(
      {
        error: 'calleeUserId is required',
        code: 'CALLEE_REQUIRED',
        message: 'กรุณาเลือกผู้รับสายจากรายชื่อผู้ใช้ที่ออนไลน์',
      },
      { status: 400 },
    );
  }

  try {
    const db = await getDatabase();
    const call = await createCall(db, actorFromSession(session), calleeUserId);
    return NextResponse.json(call, { status: 201 });
  } catch (error) {
    return videoCallErrorResponse(error, 'video_call_create_failed');
  }
}
