// Server-side backstop — pull for hospitals whose agent has gone quiet.
//
// The agent on the hospital's workstation is the primary source (it reaches
// HOSxP through the LOCAL gateway, which no rate limit applies to). This
// backstop is the safety net: if the agent stops — the machine is off, the
// install broke, nobody opened the browser either — the server pulls over
// the BMS tunnel so the province dashboard does not silently go stale.
//
// Why this is affordable where the old 30-second scheduler was not: the
// original server scheduler was switched off in 962f342 because "the BMS
// tunnel rate-limits at 15 calls/sec/hospital and the server-side scheduler
// couldn't keep up with the per-cycle query volume across all 26 hospitals".
// At a 15-minute cadence for hospitals WITHOUT a working agent, the load is
// a small fraction of that.
//
// The server can only poll while it holds a usable HOSxP session. That
// session is refreshed from the session id every push carries
// (`bms_session_id`) — see src/services/sync/maternity-assessment.ts
// (serverBmsSession). Without a recent push the server falls back to the
// stored session and, if that has expired, skips the hospital rather than
// hammering the tunnel.
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { validateTunnelUrl } from '@/lib/bms-tunnel-url';
import { SseManager } from '@/lib/sse';
import { pollHospital } from '@/services/sync/polling';
import { getAgentHeartbeat, isAgentHeartbeatFresh } from '@/services/sync/agent-heartbeat';
import { serverBmsSession } from '@/services/sync/maternity-assessment';
import type { DatabaseDialect } from '@/config/hosxp-queries';

export const BACKSTOP_INTERVAL_MS = 15 * 60 * 1000;

/** Never let one cycle's hospitals run back-to-back and spike the tunnel. */
const PER_HOSPITAL_STAGGER_MS = 5_000;

interface BackstopHospital {
  id: string;
  hcode: string;
  tunnel_url: string | null;
  session_jwt: string | null;
  session_expires_at: string | Date | null;
  database_type: string | null;
}

export interface BackstopResult {
  polled: number;
  skippedNoAgent: number;
  skippedNoSession: number;
  /** Tunnel host is not on the trusted list — no credentials were sent. */
  skippedUntrustedTunnel: number;
  failed: number;
}

/**
 * Hospitals the server should poll this cycle: active, linked to a HOSxP
 * tunnel, not purged, and WITHOUT a fresh agent heartbeat.
 */
export async function selectBackstopHospitals(db: DatabaseAdapter): Promise<BackstopHospital[]> {
  const rows = await db.query<BackstopHospital>(
    `SELECT h.id, h.hcode, c.tunnel_url, c.session_jwt, c.session_expires_at, c.database_type
       FROM hospitals h
       JOIN hospital_bms_config c ON c.hospital_id = h.id
      WHERE h.is_active = true
        AND c.tunnel_url IS NOT NULL
        AND TRIM(c.tunnel_url) <> ''
        AND c.data_purged_at IS NULL`,
  );
  return rows;
}

export async function runAgentBackstop(
  db: DatabaseAdapter,
  sseManager: SseManager,
  now: Date = new Date(),
): Promise<BackstopResult> {
  const result: BackstopResult = {
    polled: 0,
    skippedNoAgent: 0,
    skippedNoSession: 0,
    skippedUntrustedTunnel: 0,
    failed: 0,
  };

  const hospitals = await selectBackstopHospitals(db);
  for (const h of hospitals) {
    const heartbeat = await getAgentHeartbeat(h.id);
    if (isAgentHeartbeatFresh(heartbeat, now)) {
      // The agent is alive and pulling — do not touch the tunnel.
      result.skippedNoAgent++;
      continue;
    }

    // Re-validate the tunnel host immediately before the server sends this
    // hospital's bearer token and marketplace token to it. The stored value
    // was checked when it was written, but it can be changed since.
    const tunnelCheck = validateTunnelUrl(h.tunnel_url, { requireTrustedHost: true });
    if (!tunnelCheck.ok) {
      result.skippedUntrustedTunnel++;
      logger.warn('agent_backstop_untrusted_tunnel', {
        hcode: h.hcode,
        reason: tunnelCheck.reason,
      });
      continue;
    }

    const session = await serverBmsSession(db, h.id);
    if (!session) {
      // No usable HOSxP session and nobody pushed one. Nothing to pull
      // with — the hospital's own machine has to push its session id.
      result.skippedNoSession++;
      logger.info('agent_backstop_no_session', { hcode: h.hcode });
      continue;
    }

    try {
      await pollHospital(
        db,
        h.id,
        h.tunnel_url as string,
        session.bmsUrl,
        session.jwt,
        (h.database_type === 'mysql' ? 'mysql' : 'postgresql') as DatabaseDialect,
        process.env.ENCRYPTION_KEY ?? '',
        sseManager,
        {
          marketplaceToken: session.marketplaceToken,
          trigger: 'scheduled',
        },
      );
      result.polled++;
    } catch (error) {
      result.failed++;
      logger.error('agent_backstop_poll_failed', { hcode: h.hcode, error });
    }

    // Stagger: one hospital's pull must not become the next one's burst.
    await new Promise((resolve) => setTimeout(resolve, PER_HOSPITAL_STAGGER_MS));
  }

  return result;
}

let intervalTimer: NodeJS.Timeout | null = null;
let firstTimer: NodeJS.Timeout | null = null;

/** Start the backstop timer. Idempotent. */
export function scheduleAgentBackstop(db: DatabaseAdapter): void {
  if (intervalTimer) return;
  const run = async () => {
    try {
      const sseManager = SseManager.getInstance();
      const result = await runAgentBackstop(db, sseManager);
      logger.info('agent_backstop_cycle', { ...result });
    } catch (error) {
      logger.error('agent_backstop_cycle_failed', { error });
    }
  };
  // First cycle a few minutes after boot — the app has just started and
  // every hospital's agent is probably still fine.
  firstTimer = setTimeout(() => {
    firstTimer = null;
    void run();
    intervalTimer = setInterval(() => void run(), BACKSTOP_INTERVAL_MS);
    intervalTimer.unref?.();
  }, 5 * 60 * 1000);
  firstTimer.unref?.();
}

export function stopAgentBackstop(): void {
  if (firstTimer) {
    clearTimeout(firstTimer);
    firstTimer = null;
  }
  if (intervalTimer) {
    clearInterval(intervalTimer);
    intervalTimer = null;
  }
}
