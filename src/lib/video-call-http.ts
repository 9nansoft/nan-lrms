// HTTP plumbing shared by the /api/calls* routes: session→actor mapping,
// VideoCallError→status mapping, and the common transition-route shape.
// Business logic stays in src/services/video-call.ts.
import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { VideoCallError, type CallActor, type VideoCallErrorCode } from '@/services/video-call';

const STATUS_BY_CODE: Record<VideoCallErrorCode, number> = {
  SELF_CALL: 400,
  CALLEE_OFFLINE: 409,
  BUSY: 409,
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  INVALID_STATE: 409,
};

export function actorFromSession(session: Session): CallActor {
  const user = session.user;
  return {
    userId: user?.id ?? '',
    name: user?.name ?? 'ไม่ทราบชื่อ',
    hospitalCode: user?.hospitalCode ?? '',
    hospitalName: user?.hospitalName ?? '',
  };
}

export function videoCallErrorResponse(error: unknown, logContext: string): NextResponse {
  if (error instanceof VideoCallError) {
    return NextResponse.json(
      { error: error.code, code: error.code, message: error.message },
      { status: STATUS_BY_CODE[error.code] },
    );
  }
  logger.error(logContext, { error });
  return NextResponse.json(
    {
      error: 'internal error',
      code: 'INTERNAL',
      message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง',
    },
    { status: 500 },
  );
}

type CallTransition = (db: DatabaseAdapter, callId: string, actor: CallActor) => Promise<unknown>;

/** accept/decline/cancel/end all share this shape: authenticated POST on
 *  /api/calls/[id]/<action>, participant checks inside the service. */
export function callTransitionRoute(transition: CallTransition, logContext: string) {
  return async function POST(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
  ): Promise<NextResponse> {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    try {
      const { id } = await params;
      const db = await getDatabase();
      const result = await transition(db, id, actorFromSession(session));
      return NextResponse.json(result ?? { ok: true });
    } catch (error) {
      return videoCallErrorResponse(error, logContext);
    }
  };
}
