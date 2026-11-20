// The agent's name-authenticity verdict.
//
// The probe runs where HOSxP is reachable (the agent on the ward
// workstation); the verdict has to land server-side so the BLOCKED badge
// shows even when no tab is open. The verdict can purge the hospital's
// recent rows, so it must not be recordable for a hospital that is
// switched off — hence the explicit hospital check in the route.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey, API_KEY_SCOPES } from '@/services/webhook';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/sync/agent-authenticity/route';

const HCODE = '10670';

/** Every scope the agent endpoints need — minted together. */
const AGENT_SCOPES = [
  API_KEY_SCOPES.AGENT_PUSH,
  API_KEY_SCOPES.AGENT_HEARTBEAT,
  API_KEY_SCOPES.AGENT_AUTHENTICITY,
];

function request(body: unknown, rawKey?: string): Request {
  return new Request('http://test/api/sync/agent-authenticity', {
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

describe('POST /api/sync/agent-authenticity', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    // The verdict is written onto hospital_bms_config — a hospital that has
    // never been onboarded has no row to write onto.
    const id = await hospitalId();
    await db.execute(
      `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        'https://test-ondemand.tunnel.hosxp.net',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a verdict with no key', async () => {
    const res = await POST(request({ status: 'authentic' }) as never);
    expect(res.status).toBe(401);
  });

  it('records the verdict for the key\'s hospital', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    const res = await POST(request({ status: 'authentic', reason: '3/3 matched' }, key.rawKey) as never);
    expect(res.status).toBe(200);

    const rows = await db.query<{ last_authenticity_status: string | null }>(
      'SELECT last_authenticity_status FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.last_authenticity_status).toBe('authentic');
  });

  it('refuses an unsupported verdict', async () => {
    const key = await createApiKey(db, await hospitalId(), 'NN-LRMS agent', AGENT_SCOPES);
    const res = await POST(request({ status: 'something_else' }, key.rawKey) as never);
    expect(res.status).toBe(400);
  });

  it('refuses a verdict for a deactivated hospital', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await db.execute('UPDATE hospitals SET is_active = false WHERE id = ?', [id]);

    const res = await POST(request({ status: 'name_unstable' }, key.rawKey) as never);
    expect(res.status).toBe(403);
  });

  it('refuses a verdict for a hospital the admin purged', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await db.execute('UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?', [
      new Date().toISOString(),
      id,
    ]);

    const res = await POST(request({ status: 'name_unstable' }, key.rawKey) as never);
    expect(res.status).toBe(403);
  });
});
