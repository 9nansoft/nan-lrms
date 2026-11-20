// POST /api/sync/agent-heartbeat — "the agent on this hospital's workstation
// is alive".
//
// A cycle that finds nothing new legitimately skips the data push, so the
// push itself cannot be the liveness signal. The heartbeat is that signal:
// the server-side backstop only polls over the rate-limited tunnel for
// hospitals whose agent has gone quiet, and the admin Sync Status can say
// WHICH path a hospital's data came from.
//
// Auth: hospital-scoped API key — same credential the agent pushes with.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { readBearer, resolveApiKeyActor } from '@/services/sync/push-auth';
import { API_KEY_SCOPES } from '@/services/webhook';
import { recordAgentHeartbeat } from '@/services/sync/agent-heartbeat';

const MAX_DETAIL_LEN = 300;

interface HeartbeatBody {
  version?: unknown;
  mode?: unknown;
  pushed?: unknown;
  detail?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const rawKey = readBearer(request);
    if (!rawKey) {
      return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveApiKeyActor(db, rawKey, {
      requireScope: API_KEY_SCOPES.AGENT_HEARTBEAT,
    });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }

    const body = (await request.json().catch(() => null)) as HeartbeatBody | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }

    const version = typeof body.version === 'string' ? body.version.slice(0, 32) : 'unknown';
    // 'unknown' is the agent's honest answer when its cycle failed before
    // the transport (local vs tunnel) had been decided.
    const mode: 'local' | 'tunnel' | 'unknown' =
      body.mode === 'tunnel' ? 'tunnel' : body.mode === 'unknown' ? 'unknown' : 'local';
    const pushed = body.pushed === true;
    const detail =
      typeof body.detail === 'string' && body.detail.length > 0
        ? body.detail.slice(0, MAX_DETAIL_LEN)
        : undefined;

    await recordAgentHeartbeat(resolution.actor.hospitalId, {
      at: new Date().toISOString(),
      version,
      mode,
      pushed,
      ...(detail ? { detail } : {}),
    });

    logger.info('agent_heartbeat', {
      hcode: resolution.actor.hcode,
      version,
      mode,
      pushed,
    });

    return NextResponse.json({ success: true, hcode: resolution.actor.hcode });
  } catch (error) {
    logger.error('agent_heartbeat_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
