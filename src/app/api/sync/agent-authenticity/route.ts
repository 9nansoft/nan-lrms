// POST /api/sync/agent-authenticity — the name-authenticity verdict from
// the headless agent on the hospital's workstation.
//
// Same verdict, same server-side effect (BLOCKED badge + purge of recently
// synced rows when the hospital flips to anonymised names) as the browser
// path — but the caller is a machine with an API key, not a tab with a
// cookie session. Kept as its own path so the browser route keeps its
// session + Origin gate.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';
import { readBearer, resolveApiKeyActor } from '@/services/sync/push-auth';
import { API_KEY_SCOPES } from '@/services/webhook';
import {
  applyAuthenticityVerdict,
  parseVerdictBody,
  type VerdictBody,
} from '@/services/sync/authenticity-verdict';

export async function POST(request: NextRequest) {
  try {
    await ensureInit();
    const rawKey = readBearer(request);
    if (!rawKey) {
      return NextResponse.json({ error: 'missing_api_key' }, { status: 401 });
    }
    const db = await getDatabase();
    const resolution = await resolveApiKeyActor(db, rawKey, {
      requireScope: API_KEY_SCOPES.AGENT_AUTHENTICITY,
    });
    if (!resolution.ok) {
      return NextResponse.json({ error: resolution.error }, { status: resolution.status });
    }

    const body = (await request.json().catch(() => null)) as VerdictBody | null;
    const verdict = parseVerdictBody(body);
    if (!verdict) {
      return NextResponse.json({ error: 'invalid_verdict' }, { status: 400 });
    }

    // Belt and braces: `resolveApiKeyActor` already refuses an inactive or
    // unknown hospital, and the check is centralised there for every agent
    // endpoint. This route re-checks the hospital row it is about to write a
    // verdict for — the verdict can PURGE that hospital's recent rows, so it
    // must not be recordable for a hospital that is switched off.
    const rows = await db.query<{ id: string; is_active: boolean | number }>(
      'SELECT id, is_active FROM hospitals WHERE id = ?',
      [resolution.actor.hospitalId],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'hospital_not_registered' }, { status: 403 });
    }
    if (rows[0].is_active !== true && rows[0].is_active !== 1) {
      return NextResponse.json({ error: 'hospital_inactive' }, { status: 403 });
    }

    const { purged } = await applyAuthenticityVerdict(
      db,
      resolution.actor.hospitalId,
      resolution.actor.hcode,
      verdict,
    );

    return NextResponse.json({
      success: true,
      hcode: resolution.actor.hcode,
      status: verdict.status,
      purged,
    });
  } catch (error) {
    logger.error('agent_authenticity_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
