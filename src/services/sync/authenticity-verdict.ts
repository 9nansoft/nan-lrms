// The name-authenticity verdict — "did HOSxP return the patients' real names?"
//
// The PROBE must run inside the hospital's own network (only the local
// 127.0.0.1:45011 gateway can re-query HOSxP reliably): a browser tab does
// it, or the headless agent on the ward workstation. The VERDICT has to live
// server-side so the BLOCKED badge shows up even when no tab is open.
//
// One implementation, two callers:
//   * /api/sync/browser-authenticity — a browser tab (NextAuth session)
//   * /api/sync/agent-authenticity  — the agent (hospital-scoped API key)
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { recordAuthenticityVerdict, type AuthenticityVerdict } from '@/services/sync/polling';

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
    await db.execute(
      `DELETE FROM cached_anc_lab_results WHERE journey_id IN (${placeholders})`,
      journeyIds,
    );
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
    await db.execute(`DELETE FROM maternal_journeys WHERE id IN (${placeholders})`, journeyIds);
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
      `DELETE FROM cached_maternity_assessments WHERE patient_id IN (${placeholders})`,
      laborIds,
    );
    await db.execute(
      `DELETE FROM cached_vital_signs WHERE patient_id IN (${placeholders})`,
      laborIds,
    );
    await db.execute(`DELETE FROM cpd_scores WHERE patient_id IN (${placeholders})`, laborIds);
    await db.execute(`DELETE FROM cached_patients WHERE id IN (${placeholders})`, laborIds);
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

export interface VerdictBody {
  status?: unknown;
  reason?: unknown;
}

export const ALLOWED_VERDICTS: ReadonlySet<AuthenticityVerdict> = new Set<AuthenticityVerdict>([
  'authentic',
  'name_unstable',
  'no_data',
]);

export interface ParsedVerdict {
  status: AuthenticityVerdict;
  reason: string | null;
}

/** Validate the verdict body. Returns null when the body is not acceptable. */
export function parseVerdictBody(body: VerdictBody | null): ParsedVerdict | null {
  if (!body || typeof body !== 'object') return null;
  if (!body.status || !ALLOWED_VERDICTS.has(body.status as AuthenticityVerdict)) return null;
  const reason =
    typeof body.reason === 'string' && body.reason.length > 0 ? body.reason.slice(0, 500) : null;
  return { status: body.status as AuthenticityVerdict, reason };
}

/**
 * Record the verdict and, on a transition INTO name_unstable, wipe the rows
 * this hospital synced in the last window so the UI stops showing
 * anonymised rows immediately.
 */
export async function applyAuthenticityVerdict(
  db: DatabaseAdapter,
  hospitalId: string,
  hcode: string,
  verdict: ParsedVerdict,
): Promise<{
  purged: {
    journeys: number;
    ancVisits: number;
    ancRisks: number;
    newborns: number;
    referrals: number;
    laborPatients: number;
  } | null;
}> {
  // Read previous status BEFORE updating so we can detect the transition
  // into 'name_unstable' exactly once per flip.
  const prevRows = await db.query<{ last_authenticity_status: string | null }>(
    'SELECT last_authenticity_status FROM hospital_bms_config WHERE hospital_id = ?',
    [hospitalId],
  );
  const prevStatus = prevRows[0]?.last_authenticity_status ?? null;

  await recordAuthenticityVerdict(db, hospitalId, verdict.status, verdict.reason);

  let purged: {
    journeys: number;
    ancVisits: number;
    ancRisks: number;
    newborns: number;
    referrals: number;
    laborPatients: number;
  } | null = null;
  if (verdict.status === 'name_unstable' && prevStatus !== 'name_unstable') {
    purged = await purgeRecentSyncs(db, hospitalId, 24 * 60 * 60 * 1000);
    logger.warn('authenticity_purge_recent_syncs', {
      hcode,
      hospitalId,
      prevStatus,
      windowHours: 24,
      ...purged,
    });
  }

  logger.info('authenticity_verdict_recorded', {
    hcode,
    hospitalId,
    status: verdict.status,
    reason: verdict.reason,
  });

  return { purged };
}
