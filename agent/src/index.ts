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
import { runBrowserPoll } from '@/lib/browser-poll';
import { loadConfig } from './config';
import { acquireSession } from './session';
import { AGENT_VERSION } from './version';

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
  mode: 'local' | 'tunnel',
  pushed: boolean,
  detail?: string,
): Promise<void> {
  try {
    await fetch(`${config.serverUrl}/api/sync/agent-heartbeat`, {
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
  } catch (e) {
    // The heartbeat is best-effort — a failed one must not stop the pull.
    logError('heartbeat_failed', e);
  }
}

let stopping = false;

async function cycle(): Promise<void> {
  const startedAt = Date.now();
  let mode: 'local' | 'tunnel' = 'local';
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
      marketplaceToken: config.marketplaceToken,
      bmsSessionId: session.sessionId,
      pushUrl: `${config.serverUrl}/api/sync/agent-push`,
      authenticityUrl: `${config.serverUrl}/api/sync/agent-authenticity`,
      pushHeaders: { authorization: `Bearer ${config.apiKey}` },
    });

    log('cycle_done', {
      mode: session.mode,
      sessionExpiresAt: session.expiresAt,
      gatewayState: session.gatewayState,
      pushed: result.pushedToServer,
      laborRead: result.labor.read,
      laborSent: result.labor.sent,
      ancRead: result.anc.read,
      ancSent: result.anc.sent,
      partographSent: result.partograph.sent,
      durationMs: Date.now() - startedAt,
      ...(result.error ? { error: result.error } : {}),
    });

    await sendHeartbeat(session.mode, result.pushedToServer, result.error);
  } catch (error) {
    logError('cycle_failed', error);
    await sendHeartbeat(mode, false, error instanceof Error ? error.message : String(error));
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

  while (!stopping) {
    await cycle();
    if (stopping) break;
    const waitMs = config.intervalMinutes * 60_000;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

main().catch((e) => {
  logError('agent_fatal', e);
  process.exit(1);
});
