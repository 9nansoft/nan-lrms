// POST/GET /api/sync/browser-push — a signed-in hospital staff member's
// browser tab pulled HOSxP data directly from 127.0.0.1:45011 and hands it
// to the central cache.
//
// NextAuth-gated; the hospital is derived from the session, not the body, so
// a user can only push data for their own hospital.
//
// This is the central path now that server-side scheduled polling is
// disabled. Each request records a SyncProgressRun (trigger='browser')
// so admins see browser-driven syncs in the /admin · Sync Status tab
// and the per-hospital Sync Log.
//
// The push body itself lives in src/services/sync/push-handler.ts — the
// headless agent (POST /api/sync/agent-push) runs the SAME handler with an
// API key instead of a session.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { handlePush, handlePushBootstrap } from '@/services/sync/push-handler';
import { resolveSessionActor } from '@/services/sync/push-auth';

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveSessionActor(db, session.user);
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    return handlePush(request, resolution.actor);
  } catch (error) {
    logger.error('browser_push_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// GET — sync bootstrap for the browser client: the self-healing newborn
// cutoff (MAX(born_at) − 2d, or a 365-day backfill window when the hospital
// has no cached newborns yet). The client inlines it into the two delivery
// queries it runs against the local gateway.
export async function GET() {
  try {
    await ensureInit();
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveSessionActor(db, session.user, { allowReadonly: true });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    return handlePushBootstrap(resolution.actor);
  } catch (error) {
    logger.error('browser_push_bootstrap_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
