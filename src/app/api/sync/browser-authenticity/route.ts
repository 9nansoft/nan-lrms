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
// Auth model is the same as /api/sync/browser-push: NextAuth session,
// hospital is derived from the session (never the body), and read-only
// sessions are rejected.
import { NextResponse, type NextRequest } from 'next/server';
import type { DatabaseAdapter } from '@/db/adapter';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { auth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import {
  recordAuthenticityVerdict,
  type AuthenticityVerdict,
} from '@/services/sync/polling';

// Wipe rows synced from this hospital within the last `windowMs` so a
// freshly-flipped `name_unstable` hospital doesn't keep anonymised rows
// visible in the UI until an admin notices. Scoped to the window because
// the verdict can flip back and forth as HOSxP recovers, and we shouldn't
// delete months-old historical data on every transient transition.
//
// Cascades through cached_anc_visits / cached_anc_risks / cached_newborns /
// cached_referrals before deleting maternal_journeys, then nulls
// cached_patients.journey_id and deletes labor rows too — mirrors the
// manual cleanup script we ran for hcode 11007 and 490090301.
async function purgeRecentSyncs(
  db: DatabaseAdapter,
  hospitalId: string,
  windowMs: number,
): Promise<{
  journeys: number;
  ancVisits: number;
  ancRisks: number;
  newborns: number;
  referrals: number;
  laborPatients: number;
}> {
  const cutoff = new Date(Date.now() - windowMs).toISOString();

  // Identify victim journey IDs.
  const journeys = await db.query<{ id: string }>(
    `SELECT id FROM maternal_journeys
      WHERE (hospital_id = ? OR current_hospital_id = ?)
        AND synced_at >= ?`,
    [hospitalId, hospitalId, cutoff],
  );
  const journeyIds = journeys.map((r) => r.id);

  let ancVisits = 0;
  let ancRisks = 0;
  let newborns = 0;
  let referrals = 0;

  if (journeyIds.length > 0) {
    // Parameterised IN-list — SQLite/PG dialect-portable via repeated `?`.
    const placeholders = journeyIds.map(() => '?').join(',');
    const v = await db.execute(
      `DELETE FROM cached_anc_visits WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
    ancVisits = (v as { rowCount?: number } | undefined)?.rowCount ?? 0;
    const r = await db.execute(
      `DELETE FROM cached_anc_risks WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
    ancRisks = (r as { rowCount?: number } | undefined)?.rowCount ?? 0;
    const n = await db.execute(
      `DELETE FROM cached_newborns WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
    newborns = (n as { rowCount?: number } | undefined)?.rowCount ?? 0;
    const f = await db.execute(
      `DELETE FROM cached_referrals WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
    referrals = (f as { rowCount?: number } | undefined)?.rowCount ?? 0;
    await db.execute(
      `UPDATE cached_patients SET journey_id = NULL WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
    await db.execute(
      `DELETE FROM maternal_journeys WHERE id IN (${placeholders})`,
      journeyIds,
    );
  }

  // Labor side: wipe cached_patients (+ their partograph/vitals/cpd_scores)
  // that this hospital synced within the window. Same anonymisation
  // suspicion applies — the labour pull is no more trustworthy than ANC.
  const laborRows = await db.query<{ id: string }>(
    `SELECT id FROM cached_patients
      WHERE hospital_id = ? AND synced_at >= ?`,
    [hospitalId, cutoff],
  );
  const laborIds = laborRows.map((r) => r.id);
  if (laborIds.length > 0) {
    const placeholders = laborIds.map(() => '?').join(',');
    await db.execute(
      `DELETE FROM cached_partograph_observations WHERE patient_id IN (${placeholders})`,
      laborIds,
    );
    await db.execute(
      `DELETE FROM cached_vital_signs WHERE patient_id IN (${placeholders})`,
      laborIds,
    );
    await db.execute(
      `DELETE FROM cpd_scores WHERE patient_id IN (${placeholders})`,
      laborIds,
    );
    await db.execute(
      `DELETE FROM cached_patients WHERE id IN (${placeholders})`,
      laborIds,
    );
  }

  return {
    journeys: journeyIds.length,
    ancVisits,
    ancRisks,
    newborns,
    referrals,
    laborPatients: laborIds.length,
  };
}

interface VerdictBody {
  status?: AuthenticityVerdict | string;
  reason?: string | null;
}

// Whitelist the verdicts the browser is allowed to report. The full
// AuthenticityVerdict union includes server-only statuses (e.g.
// missing_marketplace_token, cid_invalid_checksum) that don't apply to a
// browser-side name probe — reject those so a client can't spoof an
// arbitrary blocking verdict.
const ALLOWED_VERDICTS: ReadonlySet<AuthenticityVerdict> = new Set<AuthenticityVerdict>([
  'authentic',
  'name_unstable',
  'no_data',
]);

export async function POST(request: NextRequest) {
  try {
    await ensureInit();

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.accessMode === 'readonly') {
      return NextResponse.json(
        { error: 'readonly_session_cannot_push' },
        { status: 403 },
      );
    }
    const hcode = session.user.hospitalCode ?? null;
    if (!hcode) {
      return NextResponse.json(
        { error: 'no_hospital_code_in_session' },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as VerdictBody | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    if (!body.status || !ALLOWED_VERDICTS.has(body.status as AuthenticityVerdict)) {
      return NextResponse.json(
        { error: 'unsupported_status', allowed: [...ALLOWED_VERDICTS] },
        { status: 400 },
      );
    }
    const reason =
      typeof body.reason === 'string' && body.reason.length > 0
        ? body.reason.slice(0, 500)
        : null;

    const db = await getDatabase();
    const rows = await db.query<{ id: string; is_active: boolean | number }>(
      'SELECT id, is_active FROM hospitals WHERE hcode = ?',
      [hcode],
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'hospital_not_registered', hcode },
        { status: 403 },
      );
    }
    if (rows[0].is_active !== true && rows[0].is_active !== 1) {
      return NextResponse.json(
        { error: 'hospital_inactive', hcode },
        { status: 403 },
      );
    }
    const hospitalId = rows[0].id;

    // Read previous status BEFORE updating so we can detect the
    // transition into 'name_unstable' exactly once per flip.
    const prevRows = await db.query<{ last_authenticity_status: string | null }>(
      'SELECT last_authenticity_status FROM hospital_bms_config WHERE hospital_id = ?',
      [hospitalId],
    );
    const prevStatus = prevRows[0]?.last_authenticity_status ?? null;

    await recordAuthenticityVerdict(
      db,
      hospitalId,
      body.status as AuthenticityVerdict,
      reason,
    );

    // Auto-purge on transition INTO name_unstable. Wipes rows synced from
    // this hospital in the last 24 hours so the UI immediately stops
    // showing anonymised garbage instead of waiting for an admin to do
    // the cleanup manually. Fires at-most-once per flip (the prevStatus
    // === 'name_unstable' guard) — re-confirming the same verdict on the
    // next cycle is a no-op.
    let purged: {
      journeys: number;
      ancVisits: number;
      ancRisks: number;
      newborns: number;
      referrals: number;
      laborPatients: number;
    } | null = null;
    if (body.status === 'name_unstable' && prevStatus !== 'name_unstable') {
      purged = await purgeRecentSyncs(db, hospitalId, 24 * 60 * 60 * 1000);
      logger.warn('browser_authenticity_purge_recent_syncs', {
        hcode,
        hospitalId,
        prevStatus,
        windowHours: 24,
        ...purged,
      });
    }

    logger.info('browser_authenticity_verdict_recorded', {
      hcode,
      hospitalId,
      status: body.status,
      reason,
    });

    return NextResponse.json({
      success: true,
      hcode,
      status: body.status,
      purged,
    });
  } catch (error) {
    logger.error('browser_authenticity_failed', { error });
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
