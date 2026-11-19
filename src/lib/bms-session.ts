// T035: BmsSessionClient — handles BMS Session API communication

import type {
  BmsQueryResult,
  BmsValidateResponse,
  SessionConfig,
  BmsApiError,
} from '@/types/bms-session';
import type { DatabaseDialect } from '@/config/hosxp-queries';
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';

export class BmsApiErrorClass extends Error {
  code: BmsApiError['code'];
  statusCode: number;
  details?: unknown;

  constructor(error: BmsApiError) {
    super(error.message);
    this.name = 'BmsApiError';
    this.code = error.code;
    this.statusCode = error.statusCode;
    this.details = error.details;
  }
}

// Classifies a raw transport failure (thrown by fetch or response.json())
// into a truthful BmsApiError. Previously every non-HTTP failure — DNS,
// refused connections, TLS, malformed JSON — was flattened to TIMEOUT in
// some call sites and CONNECTION_ERROR in others, regardless of cause.
function classifyTransportError(error: unknown): BmsApiError {
  const err = error as Error & { cause?: { code?: string } };
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return { code: 'TIMEOUT', message: `Request timed out: ${err.message}`, statusCode: 0 };
  }
  const causeCode = String(err?.cause?.code ?? '');
  const detail =
    causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN'
      ? 'DNS lookup failed'
      : causeCode === 'ECONNREFUSED'
        ? 'connection refused'
        : causeCode.startsWith('ERR_TLS') ||
            causeCode === 'CERT_HAS_EXPIRED' ||
            causeCode === 'DEPTH_ZERO_SELF_SIGNED_CERT'
          ? 'TLS error'
          : err instanceof SyntaxError
            ? 'invalid JSON response'
            : 'network error';
  return {
    code: 'CONNECTION_ERROR',
    message: `${detail}: ${err?.message ?? String(error)}`,
    statusCode: 0,
  };
}

export class BmsSessionClient {
  private tunnelUrl: string;

  constructor(tunnelUrl: string) {
    this.tunnelUrl = tunnelUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  async getSessionId(): Promise<string> {
    const url = `${this.tunnelUrl}/api/SessionID`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        // A public tunnel answers "Access Denied" here: /api/SessionID belongs
        // to the LOCAL gateway (127.0.0.1:45011) on the ward's workstation.
        // Say that, so the log names the cause instead of a bare 500.
        const detail = await response.text().catch(() => '');
        throw new BmsApiErrorClass({
          code: 'CONNECTION_ERROR',
          message: `Failed to get session ID from ${this.tunnelUrl}: ${response.statusText}${
            detail ? ` — ${detail.slice(0, 120)}` : ''
          }`,
          statusCode: response.status,
        });
      }
      const sessionId = await response.json();
      if (typeof sessionId === 'string') return sessionId;
      // Some gateways answer {session_id: "..."} / {SessionID: "..."}.
      const fromObject = (sessionId as { session_id?: unknown; SessionID?: unknown } | null) ?? {};
      const candidate = fromObject.session_id ?? fromObject.SessionID;
      if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate.trim();
      throw new BmsApiErrorClass({
        code: 'CONNECTION_ERROR',
        message: `Failed to get session ID from ${this.tunnelUrl}: the response carries no session id`,
        statusCode: response.status,
      });
    } catch (error) {
      if (error instanceof BmsApiErrorClass) throw error;
      throw new BmsApiErrorClass(classifyTransportError(error));
    }
  }

  async validateSession(sessionId: string, validateUrl: string): Promise<SessionConfig> {
    let response: Response;
    try {
      // PasteJSON answers the session exchange ONLY over GET with
      // ?Action=GET&code=<sid>. A POST with a JSON body answers 200 OK with
      // {MessageCode: 500, Message: 'No Action'} — a payload without the
      // result.user_info envelope, so neither the bearer token nor the API
      // URL ever arrives. The browser client (src/lib/bms-browser-client.ts)
      // has always used the GET form; the server port did not, and every
      // session refresh therefore produced a session without a token.
      // The cache-busting `_` keeps an intermediate proxy from replaying a
      // stale session.
      const url = `${validateUrl}${validateUrl.includes('?') ? '&' : '?'}Action=GET&code=${encodeURIComponent(sessionId)}&_=${Date.now()}`;
      response = await fetch(url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      throw new BmsApiErrorClass(classifyTransportError(error));
    }

    if (!response.ok) {
      const code = response.status === 501 ? 'UNAUTHORIZED' : 'CONNECTION_ERROR';
      throw new BmsApiErrorClass({
        code,
        message: `Session validation failed: ${response.statusText}`,
        statusCode: response.status,
      });
    }

    let data: BmsValidateResponse;
    try {
      data = (await response.json()) as BmsValidateResponse;
    } catch (error) {
      throw new BmsApiErrorClass({
        code: 'CONNECTION_ERROR',
        message: 'Session validation failed: invalid JSON response',
        statusCode: response.status,
      });
    }

    // The envelope: result.user_info holds the API URL and the bearer token
    // (bms_session_code); result.key_value is the token's fallback. The
    // top-level jwt/bms_url of the old port are NOT part of the response.
    const result = data.result ?? {};
    const userInfo = result.user_info ?? {};
    const jwt = userInfo.bms_session_code ?? result.key_value ?? data.jwt;
    const bmsUrl = userInfo.bms_url ?? data.bms_url;

    // A session without a token is worse than no session: every later query
    // would go out with "Bearer undefined" and fail as a silent 401. Fail
    // here, where the cause is still visible.
    if (!jwt || !bmsUrl) {
      throw new BmsApiErrorClass({
        code: 'UNAUTHORIZED',
        message:
          'Session validation failed: the response carries no bearer token (bms_session_code/key_value) and no API URL',
        statusCode: response.status,
      });
    }

    const expiredSecond = Number(result.expired_second ?? data.expired_second ?? 0);
    return {
      sessionId,
      jwt,
      bmsUrl,
      userInfo: {
        name: userInfo.name ?? '',
        position: userInfo.position ?? '',
        hospital_code: userInfo.hospital_code ?? '',
        department: userInfo.department ?? '',
        is_hr_admin: Boolean(userInfo.is_hr_admin),
        is_director: Boolean(userInfo.is_director),
      },
      expiresAt: new Date(Date.now() + expiredSecond * 1000),
      expiredSecond,
    };
  }

  async executeQuery(
    sql: string,
    bmsUrl: string,
    jwt: string,
    params?: Record<string, unknown>,
    options?: {
      marketplaceToken?: string | null;
      appIdentifier?: string;
    },
  ): Promise<BmsQueryResult> {
    const url = `${bmsUrl}/api/sql`;
    try {
      const body: Record<string, unknown> = { sql };
      if (params) body.params = params;
      if (options?.appIdentifier) body.app = options.appIdentifier;
      if (options?.marketplaceToken) body['marketplace-token'] = options.marketplaceToken;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const code =
          response.status === 501
            ? 'UNAUTHORIZED'
            : response.status === 409
              ? 'SQL_ERROR'
              : 'CONNECTION_ERROR';
        // The gateway's own message names the cause ("relation ... does not
        // exist", a syntax error, a permission problem). Without it every
        // failure reads the same and the operator has to guess.
        const body = await response.text().catch(() => '');
        let message = `SQL query failed: ${response.statusText}`;
        try {
          const parsed = JSON.parse(body) as { Message?: string };
          if (parsed?.Message) message = `${message} — ${parsed.Message}`;
        } catch {
          // A non-JSON body — keep the status line.
        }
        throw new BmsApiErrorClass({
          code,
          message,
          statusCode: response.status,
        });
      }

      return await response.json();
    } catch (error) {
      if (error instanceof BmsApiErrorClass) throw error;
      throw new BmsApiErrorClass(classifyTransportError(error));
    }
  }

  // Detects the HOSxP database dialect by running a version query. Returns
  // null (never a guessed dialect) when detection fails for any reason —
  // callers must treat null as "unknown" and ask for an explicit dialect
  // rather than silently persisting a wrong guess.
  async getDatabaseType(
    bmsUrl: string,
    jwt: string,
    options?: { marketplaceToken?: string | null; appIdentifier?: string },
  ): Promise<DatabaseDialect | null> {
    try {
      const result = await this.executeQuery('SELECT version()', bmsUrl, jwt, undefined, options);
      const first = result.data[0] ?? {};
      const version = String(
        first['version()'] ?? first.version ?? Object.values(first)[0] ?? '',
      ).toLowerCase();
      return version.includes('postgresql') ? 'postgresql' : 'mysql';
    } catch (error) {
      const code = error instanceof BmsApiErrorClass ? error.code : 'CONNECTION_ERROR';
      logger.warn('bms_db_type_detect_failed', { code });
      return null;
    }
  }
}

/**
 * Resolve a usable BMS session id for a hospital, for the MOPH alert drain
 * (codex #6a: the in-band session from the sync request may have expired by
 * the time the drain runs).
 *
 * Fast path: return the cached `session_id` from `hospital_bms_config` if it
 * is still valid (`session_expires_at` in the future with a safety margin).
 * Slow path: fetch a fresh session id from the hospital's tunnel via
 * `BmsSessionClient.getSessionId()`. Throws on missing config / tunnel failure
 * — the drain catches and defers all pending rows to the next run.
 *
 * NOTE: this only fetches the *session id* (the MOPH API resolves the hospital
 * JWT server-side from it). It does not validate the session or fetch a JWT —
 * that is the BMS Session API's job, not ours.
 */
export async function resolveSessionIdForHospital(
  db: DatabaseAdapter,
  hospitalId: string,
): Promise<string> {
  const rows = await db.query<{
    tunnel_url: string;
    session_id: string | null;
    session_expires_at: Date | string | null;
  }>(
    `SELECT tunnel_url, session_id, session_expires_at
     FROM hospital_bms_config
     WHERE hospital_id = $1
     LIMIT 1`,
    [hospitalId],
  );
  if (rows.length === 0 || !rows[0].tunnel_url) {
    throw new BmsApiErrorClass({
      code: 'CONNECTION_ERROR',
      message: `no tunnel_url configured for hospital ${hospitalId}`,
      statusCode: 0,
    });
  }
  const cfg = rows[0];

  // Fast path: cached session still valid (>60s margin).
  if (cfg.session_id) {
    const expires = cfg.session_expires_at ? new Date(cfg.session_expires_at).getTime() : 0;
    if (expires && expires - Date.now() > 60_000) {
      return cfg.session_id;
    }
  }

  // Slow path: pull a fresh session id from the tunnel.
  const client = new BmsSessionClient(cfg.tunnel_url);
  return client.getSessionId();
}
