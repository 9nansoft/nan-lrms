// Session acquisition — the one thing the central server can NEVER do.
//
// The server cannot mint a HOSxP session by itself: `/api/SessionID` belongs
// to the LOCAL gateway on the ward's workstation, and a public tunnel answers
// "Access Denied" (src/lib/bms-session.ts:71-73). The agent runs ON that
// workstation, so it can.
//
//   1. GET  http://127.0.0.1:45011/api/SessionID  → a live session id
//   2. GET  https://hosxp.net/phapi/PasteJSON?...  → bearer + API URL
//   3. Probe the LOCAL gateway with a trivial query → if it answers, keep
//      talking to it (no tunnel, no shared rate limit, real rows)
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
}

const SESSION_ID_TIMEOUT_MS = 10_000;

/** The local gateway answers either a bare id or {session_id|SessionID}. */
export async function readLocalSessionId(localGateway: string): Promise<string> {
  const res = await fetch(`${localGateway}/api/SessionID`, {
    signal: AbortSignal.timeout(SESSION_ID_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `local gateway ${localGateway}/api/SessionID ตอบ ${res.status} — HOSxP/BMS gateway ต้องเปิดอยู่`,
    );
  }
  const text = (await res.text()).trim();
  if (text.length === 0) throw new Error('local gateway ตอบ session id ว่างเปล่า');
  if (text.startsWith('{')) {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error('local gateway ตอบ JSON ที่อ่านไม่ได้');
    }
    const candidate = parsed.session_id ?? parsed.SessionID;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
    throw new Error('local gateway ไม่ได้ส่ง session id กลับมา');
  }
  return text;
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
  marketplaceToken: string | null,
): Promise<HosxpSession> {
  const sessionId = await readLocalSessionId(localGateway);
  const response = await retrieveBmsSession(sessionId);
  const connection = extractConnectionConfig(response);
  const { config, isLocal } = await probeLocalApi(connection, marketplaceToken);
  return {
    sessionId,
    apiUrl: config.apiUrl,
    bearerToken: config.bearerToken,
    mode: isLocal ? 'local' : 'tunnel',
  };
}

export { APP_IDENTIFIER };
