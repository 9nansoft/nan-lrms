// POST/GET /api/sync/agent-push — the headless agent that runs on the
// HOSPITAL's own workstation.
//
// Why this exists: a hospital's data reaches the central cache only while
// somebody's browser tab is open (the browser-push path). With no tab open
// the ward board still shows live HOSxP data, but the province dashboard
// goes stale — and a hospital that never opens a browser is invisible.
//
// The agent is that browser tab, without the browser: it runs on the
// workstation that already hosts HOSxP and its BMS gateway
// (127.0.0.1:45011), pulls the same data, and pushes it here on a timer.
//
// Auth: `Authorization: Bearer <api key>` — the key is hospital-scoped
// (webhook_api_keys.hospital_id), so the hospital is derived from the
// CREDENTIAL, never from the body. The push body and every processor are
// the same ones the browser path uses (src/services/sync/push-handler.ts).
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { handlePush, handlePushBootstrap } from '@/services/sync/push-handler';
import { readBearer, resolveApiKeyActor } from '@/services/sync/push-auth';
import { API_KEY_SCOPES } from '@/services/webhook';

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const rawKey = readBearer(request);
    if (!rawKey) {
      return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveApiKeyActor(db, rawKey, {
      requireScope: API_KEY_SCOPES.AGENT_PUSH,
    });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    return handlePush(request, resolution.actor);
  } catch (error) {
    logger.error('agent_push_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

// GET — the same bootstrap the browser client uses (newborn cutoff,
// assessment cursors, referral arrival probe). The agent needs the same
// cutoffs so its pull windows match the server's cursors.
export async function GET(request: NextRequest) {
  try {
    await ensureInit();
    const rawKey = readBearer(request);
    if (!rawKey) {
      return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveApiKeyActor(db, rawKey, {
      requireScope: API_KEY_SCOPES.AGENT_PUSH,
    });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }
    return handlePushBootstrap(resolution.actor);
  } catch (error) {
    logger.error('agent_push_bootstrap_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
