// Session acquisition — the one thing the central server can NEVER do.
//
// The server cannot mint a HOSxP session by itself: `/api/SessionID` belongs
// to the LOCAL gateway on the ward's workstation, and a public tunnel answers
// "Access Denied" (src/lib/bms-session.ts:71-73). The agent runs ON that
// workstation, so it can.
//
// The gateway is asked for a LIVE session on every cycle:
//
//   1. GET http://127.0.0.1:45011/api/GetBMSSessionID
//        Authorization: Bearer <gateway token>
//        → { data: { bms_session_id, bms_url, expires_at, gateway_state } }
//   2. GET https://hosxp.net/phapi/PasteJSON?...&code=<bms_session_id>
//        → bearer token (+ the API URL)
//   3. Probe the LOCAL gateway with a trivial query → if it answers, keep
//      talking to it (no tunnel, no shared rate limit, real rows)
//
// The session id is NOT cached: the gateway renews it in the background and
// expires it, so every cycle asks for a fresh one.
import {
  retrieveBmsSession,
  extractConnectionConfig,
  probeLocalApi,
  APP_IDENTIFIER,
} from '@/lib/bms-browser-client';

export interface HosxpSession {
  sessionId: string;
  apiUrl: string;
  bearerToken: string;
  /** Which transport answered — 'local' is the good one. */
  mode: 'local' | 'tunnel';
  /** When the gateway says this session expires (ISO). */
  expiresAt: string | null;
  /** The gateway's own state — 'running' when it is serving HOSxP. */
  gatewayState: string | null;
}

const SESSION_ID_TIMEOUT_MS = 15_000;

/** The gateway's answer to GetBMSSessionID. */
export interface GatewaySession {
  bmsSessionId: string;
  bmsUrl: string | null;
  expiresAt: string | null;
  gatewayState: string | null;
}

/**
 * Ask the local gateway for a live BMS session.
 *
 * The gateway token is a credential of THIS workstation — it is what makes
 * the endpoint answer instead of refusing. The response carries the session
 * id the rest of the flow is built on, plus the tunnel URL and the moment
 * the session expires.
 */
export async function readGatewaySession(
  localGateway: string,
  gatewayToken: string,
): Promise<GatewaySession> {
  const res = await fetch(`${localGateway}/api/GetBMSSessionID`, {
    headers: { Authorization: `Bearer ${gatewayToken}` },
    signal: AbortSignal.timeout(SESSION_ID_TIMEOUT_MS),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(
      `local gateway ${localGateway}/api/GetBMSSessionID ตอบ ${res.status}` +
        (text ? ` — ${text.slice(0, 120)}` : ''),
    );
  }
  let payload: {
    MessageCode?: number;
    Message?: string;
    data?: {
      bms_session_id?: string;
      bms_url?: string;
      expires_at?: string;
      gateway_state?: string;
    };
  };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new Error('local gateway ตอบ JSON ที่อ่านไม่ได้');
  }
  const sessionId = payload.data?.bms_session_id;
  if (!sessionId || sessionId.trim().length === 0) {
    const message = payload.Message ? ` (${payload.Message})` : '';
    throw new Error(`local gateway ไม่ได้ส่ง bms_session_id กลับมา${message}`);
  }
  return {
    bmsSessionId: sessionId.trim(),
    bmsUrl: payload.data?.bms_url?.trim() || null,
    expiresAt: payload.data?.expires_at ?? null,
    gatewayState: payload.data?.gateway_state ?? null,
  };
}

/**
 * A live session + the connection to use.
 *
 * `marketplaceToken` is optional: the LOCAL gateway serves the hospital's
 * real rows, so the token (which unlocks the marketplace's own scopes and
 * stops it randomising CID/HN) is only needed when we fall back to the
 * public tunnel.
 */
export async function acquireSession(
  localGateway: string,
  gatewayToken: string,
  marketplaceToken: string | null,
): Promise<HosxpSession> {
  const gateway = await readGatewaySession(localGateway, gatewayToken);
  const response = await retrieveBmsSession(gateway.bmsSessionId);
  const connection = extractConnectionConfig(response);
  // The gateway knows the hospital's tunnel; prefer it over whatever
  // PasteJSON reported (same value, but the gateway is the authority).
  if (gateway.bmsUrl) {
    connection.apiUrl = gateway.bmsUrl;
  }
  const { config, isLocal } = await probeLocalApi(connection, marketplaceToken);
  return {
    sessionId: gateway.bmsSessionId,
    apiUrl: config.apiUrl,
    bearerToken: config.bearerToken,
    mode: isLocal ? 'local' : 'tunnel',
    expiresAt: gateway.expiresAt,
    gatewayState: gateway.gatewayState,
  };
}

export { APP_IDENTIFIER };
