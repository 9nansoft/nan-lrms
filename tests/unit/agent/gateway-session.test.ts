// The local BMS gateway's session endpoint.
//
// GET http://127.0.0.1:45011/api/GetBMSSessionID (Bearer <gateway token>)
// is the ONLY way to get a live HOSxP session id — the public tunnel refuses
// it. The agent must ask the gateway on every cycle (the gateway renews the
// session in the background and expires it), so this is the one call that
// decides whether a cycle can run at all.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readGatewaySession } from '../../../agent/src/session';

const GATEWAY = 'http://127.0.0.1:45011';
const TOKEN = 'gateway-token-abc';

function gatewayResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('readGatewaySession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads the session id, tunnel URL and expiry the gateway reports', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      gatewayResponse({
        result: {},
        MessageCode: 200,
        Message: 'OK',
        data: {
          bms_session_id: 'CF0575F8-40FA-4853-BD0F-64907B6E6DBB',
          bms_url: 'https://10716-saciw.tunnel.hosxp.net',
          created_at: '2026-11-20T09:37:45',
          renewed_at: '2026-11-20T11:07:51',
          expires_at: '2026-11-20T21:07:51',
          gateway_state: 'running',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const session = await readGatewaySession(GATEWAY, TOKEN);

    expect(session.bmsSessionId).toBe('CF0575F8-40FA-4853-BD0F-64907B6E6DBB');
    expect(session.bmsUrl).toBe('https://10716-saciw.tunnel.hosxp.net');
    expect(session.expiresAt).toBe('2026-11-20T21:07:51');
    expect(session.gatewayState).toBe('running');

    // The gateway token is what makes the endpoint answer.
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GATEWAY}/api/GetBMSSessionID`);
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('fails with a readable message when the gateway refuses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(gatewayResponse({ Message: 'nope' }, 401)));
    await expect(readGatewaySession(GATEWAY, TOKEN)).rejects.toThrow(/401/);
  });

  it('fails when the gateway answers 200 but carries no session id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(gatewayResponse({ MessageCode: 200, Message: 'OK', data: {} })),
    );
    await expect(readGatewaySession(GATEWAY, TOKEN)).rejects.toThrow(/bms_session_id/);
  });
});
