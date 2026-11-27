// NN-LRMS agent — the browser tab without the browser.
//
// Runs on the hospital's own workstation (the machine that hosts HOSxP and
// its BMS gateway at 127.0.0.1:45011). Every cycle it pulls the same data
// the browser pulls — labour, partograph, ANC, newborns, referrals — and
// pushes it to the NN-LRMS server, so the province dashboard keeps updating
// even when nobody has a browser tab open.
//
// The pull logic is NOT re-implemented here: it is the very same
// `runBrowserPoll` the browser tab uses, pointed at a different push URL.
// One implementation, two drivers — the agent cannot drift from the browser.
//
// Logging is PHI-free on purpose: counts and status only.
import './install-fetch';
import { runBrowserPoll } from '@/lib/browser-poll';
import { loadConfig } from './config';
import { acquireSession } from './session';
import { AGENT_VERSION } from './version';
import { nextWait, isAuthRefusal } from './backoff';

const config = loadConfig();

function log(message: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    msg: message,
    ...extra,
  });
  process.stdout.write(`${line}\n`);
}

function logError(message: string, error: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level: 'error',
    msg: message,
    error: error instanceof Error ? error.message : String(error),
  });
  process.stderr.write(`${line}\n`);
}

/** Tell the server the agent is alive — even when there was nothing to send. */
async function sendHeartbeat(
  mode: 'local' | 'tunnel' | 'unknown',
  pushed: boolean,
  detail?: string,
): Promise<{ authRefused: boolean }> {
  try {
    const res = await fetch(`${config.serverUrl}/api/sync/agent-heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        version: AGENT_VERSION,
        mode,
        pushed,
        ...(detail ? { detail } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      logError('heartbeat_rejected', `HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { authRefused: res.status === 401 || res.status === 403 };
    }
    return { authRefused: false };
  } catch (e) {
    // The heartbeat is best-effort — a failed one must not stop the pull.
    logError('heartbeat_failed', e);
    return { authRefused: false };
  }
}

let stopping = false;

/**
 * One pull-push cycle.
 *
 * Returns whether the server refused this agent in a way a retry cannot fix
 * (403 permanentBlock, or a 401 from a revoked key) — the main loop then
 * backs off instead of re-sending a doomed push every intervalMinutes.
 */
async function cycle(): Promise<{ blocked: boolean }> {
  const startedAt = Date.now();
  let mode: 'local' | 'tunnel' | 'unknown' = 'unknown';
  try {
    const session = await acquireSession(
      config.localGateway,
      config.gatewayToken,
      config.marketplaceToken,
    );
    mode = session.mode;

    const result = await runBrowserPoll({
      config: {
        apiUrl: session.apiUrl,
        bearerToken: session.bearerToken,
        appIdentifier: 'NN-LRMS.Web',
      },
      marketplaceToken: session.marketplaceToken,
      bmsSessionId: session.sessionId,
      pushUrl: `${config.serverUrl}/api/sync/agent-push`,
      authenticityUrl: `${config.serverUrl}/api/sync/agent-authenticity`,
      pushHeaders: { authorization: `Bearer ${config.apiKey}` },
      // The gateway reports the hospital's tunnel URL on every cycle; the
      // server needs it to pull this hospital's data itself (assessments,
      // the backstop) instead of waiting for a browser tab.
      hosxpFacts: {
        bmsUrl: session.bmsUrl,
        marketplaceToken: session.marketplaceToken,
      },
    });

    const assessmentsRead = result.assessments?.rowsRead ?? 0;
    const newbornsRead =
      (result.newborns?.infantsRead ?? 0) + (result.newborns?.pregnanciesRead ?? 0);
    const referralsRead =
      (result.referrals?.referoutsRead ?? 0) + (result.referrals?.referinsRead ?? 0);

    log('cycle_done', {
      mode: session.mode,
      sessionExpiresAt: session.expiresAt,
      gatewayState: session.gatewayState,
      pushed: result.pushedToServer,
      ...(!result.pushedToServer && !result.error ? { skipReason: 'no_changes' } : {}),
      ...(result.authenticity ? { authenticity: result.authenticity.status } : {}),
      laborRead: result.labor.read,
      laborSent: result.labor.sent,
      ancRead: result.anc.read,
      ancSent: result.anc.sent,
      partographSent: result.partograph.sent,
      assessmentsRead,
      newbornsRead,
      referralsRead,
      durationMs: Date.now() - startedAt,
      ...(result.error ? { error: result.error } : {}),
    });

    const hb = await sendHeartbeat(session.mode, result.pushedToServer, result.error);
    const blocked =
      result.permanentBlock === true ||
      (result.error ? isAuthRefusal(result.error) : false) ||
      hb.authRefused;
    return { blocked };
  } catch (error) {
    logError('cycle_failed', error);
    const hb = await sendHeartbeat(
      mode,
      false,
      error instanceof Error ? error.message : String(error),
    );
    return { blocked: isAuthRefusal(error) || hb.authRefused };
  }
}

async function main(): Promise<void> {
  log('agent_started', {
    version: AGENT_VERSION,
    serverUrl: config.serverUrl,
    intervalMinutes: config.intervalMinutes,
    localGateway: config.localGateway,
  });

  const stop = () => {
    stopping = true;
    log('agent_stopping');
    // Give the current cycle a moment to finish its push.
    setTimeout(() => process.exit(0), 2_000).unref();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // A cycle the server keeps refusing (revoked key, purged hospital) grows
  // the wait instead of re-sending a doomed push every intervalMinutes; any
  // clean cycle puts the normal interval back. See backoff.ts.
  let backoffMinutes = 0;
  while (!stopping) {
    const outcome = await cycle();
    if (stopping) break;
    const { waitMs, backoffMinutes: nextBackoff } = nextWait(
      config.intervalMinutes,
      backoffMinutes,
      outcome.blocked,
    );
    if (outcome.blocked) {
      log('agent_backoff', { waitMinutes: nextBackoff });
    }
    backoffMinutes = nextBackoff;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

main().catch((e) => {
  logError('agent_fatal', e);
  process.exit(1);
});
