// POST /api/sync/browser-authenticity — receives the verdict of the
// browser-side name round-trip authenticity probe and persists it onto
// hospital_bms_config so the admin Sync Status tab and the dashboard /
// admin map both surface the BLOCKED state.
//
// This endpoint exists because the probe itself MUST run inside the
// user's tab (only the local 127.0.0.1:45011 gateway can re-query HOSxP
// reliably), but the verdict needs to live server-side so:
//   - the dashboard syncStatus derivation in services/dashboard.ts can
//     surface the BLOCKED badge even for tabs that aren't currently open,
//   - admins can review the failure reason on /admin → Sync Status,
//   - the existing isSyncFailureStatus() / SYNC_FAILURE_STATUSES wiring
//     in src/config/sync-status.ts picks it up uniformly.
//
// Auth model: a NextAuth session (a browser tab) OR a hospital-scoped API
// key (the headless agent). The hospital is derived from the credential,
// never from the body — same rule as the push endpoints. Read-only sessions
// are rejected.
//
// The verdict logic itself lives in src/services/sync/authenticity-verdict.ts
// so the agent's endpoint (/api/sync/agent-authenticity) runs exactly the
// same code.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { auth } from '@/lib/auth';
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

    // Auth: a NextAuth session (a browser tab) OR an API key (the headless
    // agent on the hospital's workstation). The hospital comes from the
    // credential, never from the body — same rule as the push endpoints.
    const rawKey = readBearer(request);
    let hospitalId: string | null = null;
    let hcode: string | null = null;
    if (rawKey) {
      const keyDb = await getDatabase();
      const resolution = await resolveApiKeyActor(keyDb, rawKey, {
        requireScope: API_KEY_SCOPES.AGENT_AUTHENTICITY,
      });
      if (!resolution.ok) {
        return NextResponse.json({ error: resolution.error }, { status: resolution.status });
      }
      hospitalId = resolution.actor.hospitalId;
      hcode = resolution.actor.hcode;
    } else {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      if (session.user.accessMode === 'readonly') {
        return NextResponse.json({ error: 'readonly_session_cannot_push' }, { status: 403 });
      }
      hcode = session.user.hospitalCode ?? null;
      if (!hcode) {
        return NextResponse.json({ error: 'no_hospital_code_in_session' }, { status: 400 });
      }
    }

    const body = (await request.json().catch(() => null)) as VerdictBody | null;
    const verdict = parseVerdictBody(body);
    if (!verdict) {
      return NextResponse.json({ error: 'invalid_verdict' }, { status: 400 });
    }

    const db = await getDatabase();
    const rows = await db.query<{ id: string; is_active: boolean | number }>(
      'SELECT id, is_active FROM hospitals WHERE hcode = ?',
      [hcode],
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: 'hospital_not_registered', hcode }, { status: 403 });
    }
    if (rows[0].is_active !== true && rows[0].is_active !== 1) {
      return NextResponse.json({ error: 'hospital_inactive', hcode }, { status: 403 });
    }
    hospitalId = rows[0].id;

    const { purged } = await applyAuthenticityVerdict(db, hospitalId, hcode, verdict);

    return NextResponse.json({
      success: true,
      hcode,
      status: verdict.status,
      purged,
    });
  } catch (error) {
    logger.error('browser_authenticity_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
