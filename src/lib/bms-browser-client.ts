import type { BmsSessionResponse, ConnectionConfig, UserInfo } from '@/types/bms-browser';

export const PASTE_JSON_URL = 'https://hosxp.net/phapi/PasteJSON';
export const APP_IDENTIFIER = 'KK-LRMS.Web';
export const SESSION_TIMEOUT_MS = 30_000;
export const QUERY_TIMEOUT_MS = 60_000;

export async function retrieveBmsSession(sessionId: string): Promise<BmsSessionResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SESSION_TIMEOUT_MS);
  try {
    const response = await fetch(PASTE_JSON_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => response.statusText);
      throw new Error(
        `BMS session retrieval failed (HTTP ${response.status}): ${detail.slice(0, 200)}`,
      );
    }
    return (await response.json()) as BmsSessionResponse;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('BMS session retrieval timed out after 30 seconds');
    }
    if (error instanceof Error && error.message.startsWith('BMS session retrieval')) throw error;
    throw new Error(`Cannot connect to BMS session API: ${(error as Error).message}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function extractConnectionConfig(r: BmsSessionResponse): ConnectionConfig {
  if (!r.jwt) throw new Error('BMS session response missing jwt');
  if (!r.bms_url) throw new Error('BMS session response missing bms_url');
  return {
    apiUrl: r.bms_url.replace(/\/$/, ''),
    bearerToken: r.jwt,
    appIdentifier: APP_IDENTIFIER,
  };
}

export function extractUserInfo(r: BmsSessionResponse): UserInfo {
  const ui = (r.user_info ?? {}) as Record<string, unknown>;
  return {
    loginname: String(ui.loginname ?? ui.username ?? ''),
    fullname: String(ui.fullname ?? ui.name ?? ''),
    hospcode: String(ui.hospcode ?? ui.hospital_code ?? ''),
    ...ui,
  };
}
