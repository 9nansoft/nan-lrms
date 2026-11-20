// The agent heartbeat — "this hospital's workstation is still pulling".
//
// The heartbeat is what tells the server-side backstop to stay off the
// tunnel (the agent already pulls), and what lets the admin UI say WHICH
// path a hospital's data came from.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey, API_KEY_SCOPES } from '@/services/webhook';
import {
  getAgentHeartbeat,
  isAgentHeartbeatFresh,
  AGENT_HEARTBEAT_STALE_MINUTES,
} from '@/services/sync/agent-heartbeat';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/sync/agent-heartbeat/route';

const HCODE = '10670';

/** Every scope the agent endpoints need — minted together. */
const AGENT_SCOPES = [
  API_KEY_SCOPES.AGENT_PUSH,
  API_KEY_SCOPES.AGENT_HEARTBEAT,
  API_KEY_SCOPES.AGENT_AUTHENTICITY,
];

function request(body: unknown, rawKey?: string): Request {
  return new Request('http://test/api/sync/agent-heartbeat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(rawKey ? { authorization: `Bearer ${rawKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function hospitalId(): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE]);
  return rows[0].id;
}

describe('POST /api/sync/agent-heartbeat', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a heartbeat with no key', async () => {
    const res = await POST(request({ version: '1.0.0', mode: 'local', pushed: true }) as never);
    expect(res.status).toBe(401);
  });

  it('records the heartbeat for the key\'s hospital', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    const res = await POST(
      request({ version: '1.2.3', mode: 'local', pushed: true }, key.rawKey) as never,
    );
    expect(res.status).toBe(200);

    const beat = await getAgentHeartbeat(id);
    expect(beat).not.toBeNull();
    expect(beat!.version).toBe('1.2.3');
    expect(beat!.mode).toBe('local');
    expect(beat!.pushed).toBe(true);
  });

  it('keeps a failed cycle visible (pushed=false + detail)', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    await POST(
      request(
        { version: '1.0.0', mode: 'tunnel', pushed: false, detail: 'local gateway unreachable' },
        key.rawKey,
      ) as never,
    );

    const beat = await getAgentHeartbeat(id);
    expect(beat!.pushed).toBe(false);
    expect(beat!.mode).toBe('tunnel');
    expect(beat!.detail).toContain('local gateway');
  });

  it('treats a heartbeat as stale once it is older than the window', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await POST(request({ version: '1.0.0', mode: 'local', pushed: true }, key.rawKey) as never);

    const beat = await getAgentHeartbeat(id);
    expect(isAgentHeartbeatFresh(beat)).toBe(true);
    expect(
      isAgentHeartbeatFresh(
        beat,
        new Date(Date.now() + (AGENT_HEARTBEAT_STALE_MINUTES + 1) * 60_000),
      ),
    ).toBe(false);
    expect(isAgentHeartbeatFresh(null)).toBe(false);
  });

  it('does not write a heartbeat for a hospital the admin purged', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await db.execute(
      `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [randomUUID(), id, 'https://test-ondemand.tunnel.hosxp.net', new Date().toISOString(), new Date().toISOString()],
    );
    await db.execute('UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?', [
      new Date().toISOString(),
      id,
    ]);

    const res = await POST(
      request({ version: '1.0.0', mode: 'local', pushed: true }, key.rawKey) as never,
    );
    expect(res.status).toBe(403);
  });
});
