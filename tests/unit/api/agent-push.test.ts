// The headless agent path — the hospital's own workstation pushing HOSxP
// data into the central cache with NO browser tab open.
//
// The agent authenticates with a hospital-scoped API key (not a session),
// so the hospital comes from the CREDENTIAL, never from the body. These
// tests pin that tenancy rule, the sync-run trigger, and the gates that
// must keep a push from putting back purged data.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { decryptSafe } from '@/lib/encryption';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { createApiKey, API_KEY_SCOPES } from '@/services/webhook';
import { getLatestSyncRun } from '@/services/sync/progress-store';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST, GET } from '@/app/api/sync/agent-push/route';

const HCODE = '10670';

/** Every scope the agent endpoints need — minted together. */
const AGENT_SCOPES = [
  API_KEY_SCOPES.AGENT_PUSH,
  API_KEY_SCOPES.AGENT_HEARTBEAT,
  API_KEY_SCOPES.AGENT_AUTHENTICITY,
  API_KEY_SCOPES.HOSXP_CONFIGURE,
];
const OTHER_HCODE = '10998';

function jsonRequest(body: unknown, rawKey?: string): Request {
  return new Request('http://test/api/sync/agent-push', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(rawKey ? { authorization: `Bearer ${rawKey}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function bootstrapRequest(rawKey?: string): Request {
  return new Request('http://test/api/sync/agent-push', {
    method: 'GET',
    headers: rawKey ? { authorization: `Bearer ${rawKey}` } : {},
  });
}

async function hospitalId(hcode = HCODE): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [hcode]);
  return rows[0].id;
}

function laborPatient(an: string): Record<string, unknown> {
  return {
    hn: `AGENT-${an}`,
    an,
    name: 'นาง ทดสอบ agent',
    cid: '1007000100131',
    age: 30,
    ga_weeks: 34,
    admit_date: '2026-07-16T06:00:00+07:00',
    labor_status: 'ACTIVE',
  };
}

describe('POST /api/sync/agent-push — the headless agent path', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses a push with no API key', async () => {
    const res = await POST(jsonRequest({ labor: { patients: [laborPatient('AG-1')] } }) as never);
    expect(res.status).toBe(401);
  });

  it('refuses a push with an unknown API key', async () => {
    const res = await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-1')] } }, 'kklrms_not_a_real_key') as never,
    );
    expect(res.status).toBe(401);
  });

  it('stores the pushed labour row under the key\'s own hospital', async () => {
    const key = await createApiKey(db, await hospitalId(), 'NN-LRMS agent', AGENT_SCOPES);
    const res = await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-OK-1')] } }, key.rawKey) as never,
    );
    expect(res.status).toBe(200);

    const rows = await db.query<{ an: string; hospital_id: string }>(
      'SELECT an, hospital_id FROM cached_patients WHERE an = ?',
      ['AG-OK-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hospital_id).toBe(await hospitalId());
  });

  it('refuses an ordinary webhook key — the agent scope is required', async () => {
    // A key minted for the HOSxP webhook sender (no scopes) must not be
    // able to drive the agent endpoints.
    const key = await createApiKey(db, await hospitalId(), 'HOSxP webhook sender');
    const res = await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-NOSCOPE-1')] } }, key.rawKey) as never,
    );
    expect(res.status).toBe(403);

    const rows = await db.query<{ an: string }>('SELECT an FROM cached_patients WHERE an = ?', [
      'AG-NOSCOPE-1',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('takes the hospital\'s tunnel URL from the agent when it is missing', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    const res = await POST(
      jsonRequest(
        {
          hosxp: { bms_url: 'https://10670-test.tunnel.hosxp.net' },
          labor: { patients: [laborPatient('AG-TUN-1')] },
        },
        key.rawKey,
      ) as never,
    );
    expect(res.status).toBe(200);

    const rows = await db.query<{ tunnel_url: string | null }>(
      'SELECT tunnel_url FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.tunnel_url).toBe('https://10670-test.tunnel.hosxp.net');
  });

  it('refuses a tunnel URL outside the trusted host list', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    const res = await POST(
      jsonRequest(
        {
          hosxp: { bms_url: 'https://evil.example.com' },
          labor: { patients: [laborPatient('AG-EVIL-1')] },
        },
        key.rawKey,
      ) as never,
    );
    expect(res.status).toBe(200);

    const rows = await db.query<{ tunnel_url: string | null }>(
      'SELECT tunnel_url FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.tunnel_url ?? null).toBeNull();
  });

  it('never overwrites a tunnel URL the hospital already has', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await db.execute(
      `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        'https://existing.tunnel.hosxp.net',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    await POST(
      jsonRequest(
        {
          hosxp: { bms_url: 'https://other.tunnel.hosxp.net' },
          labor: { patients: [laborPatient('AG-KEEP-1')] },
        },
        key.rawKey,
      ) as never,
    );

    const rows = await db.query<{ tunnel_url: string | null }>(
      'SELECT tunnel_url FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.tunnel_url).toBe('https://existing.tunnel.hosxp.net');
  });

  it('stores the marketplace token encrypted', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    await POST(
      jsonRequest(
        {
          hosxp: {
            bms_url: 'https://10670-test.tunnel.hosxp.net',
            marketplace_token: 'mkt-secret-value',
          },
          labor: { patients: [laborPatient('AG-MKT-1')] },
        },
        key.rawKey,
      ) as never,
    );

    const rows = await db.query<{ marketplace_token: string | null }>(
      'SELECT marketplace_token FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    const stored = rows[0]?.marketplace_token ?? '';
    expect(stored).not.toBe('mkt-secret-value');
    expect(decryptSafe(stored)).toBe('mkt-secret-value');
  });

  it('ignores connection facts from a key without the configure capability', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', [
      API_KEY_SCOPES.AGENT_PUSH,
      API_KEY_SCOPES.AGENT_HEARTBEAT,
      API_KEY_SCOPES.AGENT_AUTHENTICITY,
    ]);

    const res = await POST(
      jsonRequest(
        {
          hosxp: { bms_url: 'https://10670-test.tunnel.hosxp.net' },
          labor: { patients: [laborPatient('AG-NOCFG-1')] },
        },
        key.rawKey,
      ) as never,
    );
    expect(res.status).toBe(200);

    const rows = await db.query<{ tunnel_url: string | null }>(
      'SELECT tunnel_url FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.tunnel_url ?? null).toBeNull();
  });

  it('refuses a tunnel that belongs to another hospital', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);

    await POST(
      jsonRequest(
        {
          hosxp: { bms_url: 'https://10999-other.tunnel.hosxp.net' },
          labor: { patients: [laborPatient('AG-OTHER-1')] },
        },
        key.rawKey,
      ) as never,
    );

    const rows = await db.query<{ tunnel_url: string | null }>(
      'SELECT tunnel_url FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(rows[0]?.tunnel_url ?? null).toBeNull();
  });

  it('takes the marketplace token from a push even without the tunnel capability', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', [
      API_KEY_SCOPES.AGENT_PUSH,
      API_KEY_SCOPES.AGENT_HEARTBEAT,
      API_KEY_SCOPES.AGENT_AUTHENTICITY,
    ]);
    // The hospital already has a tunnel (from onboarding); the token is what
    // is still missing.
    await db.execute(
      `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        id,
        'https://10670-test.tunnel.hosxp.net',
        new Date().toISOString(),
        new Date().toISOString(),
      ],
    );

    await POST(
      jsonRequest(
        {
          hosxp: { marketplace_token: 'mkt-from-push' },
          labor: { patients: [laborPatient('AG-MKT2-1')] },
        },
        key.rawKey,
      ) as never,
    );

    const rows = await db.query<{ marketplace_token: string | null }>(
      'SELECT marketplace_token FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    expect(decryptSafe(rows[0]?.marketplace_token ?? '')).toBe('mkt-from-push');
  });

  it('records the sync run with trigger=agent', async () => {
    const key = await createApiKey(db, await hospitalId(), 'NN-LRMS agent', AGENT_SCOPES);
    await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-TRIG-1')] } }, key.rawKey) as never,
    );

    const run = await getLatestSyncRun(await hospitalId());
    expect(run).not.toBeNull();
    expect(run!.trigger).toBe('agent');
  });

  it('ignores a hospital code in the body — the key decides the hospital', async () => {
    const key = await createApiKey(db, await hospitalId(), 'NN-LRMS agent', AGENT_SCOPES);
    const res = await POST(
      jsonRequest(
        {
          hospitalCode: OTHER_HCODE,
          labor: { patients: [laborPatient('AG-TEN-1')] },
        },
        key.rawKey,
      ) as never,
    );
    expect(res.status).toBe(200);

    const mine = await db.query<{ an: string }>(
      'SELECT an FROM cached_patients WHERE an = ? AND hospital_id = ?',
      ['AG-TEN-1', await hospitalId()],
    );
    expect(mine).toHaveLength(1);

    const other = await db.query<{ an: string }>(
      'SELECT an FROM cached_patients WHERE an = ? AND hospital_id = ?',
      ['AG-TEN-1', await hospitalId(OTHER_HCODE)],
    );
    expect(other).toHaveLength(0);
  });

  it('refuses a push for a hospital the admin purged', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    const existing = await db.query<{ id: string }>(
      'SELECT id FROM hospital_bms_config WHERE hospital_id = ?',
      [id],
    );
    if (existing.length === 0) {
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
    }
    await db.execute(
      'UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?',
      [new Date().toISOString(), id],
    );

    const res = await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-PURGE-1')] } }, key.rawKey) as never,
    );
    expect(res.status).toBe(403);

    const rows = await db.query<{ an: string }>('SELECT an FROM cached_patients WHERE an = ?', [
      'AG-PURGE-1',
    ]);
    expect(rows).toHaveLength(0);
  });

  it('refuses a push for a deactivated hospital', async () => {
    const id = await hospitalId();
    const key = await createApiKey(db, id, 'NN-LRMS agent', AGENT_SCOPES);
    await db.execute('UPDATE hospitals SET is_active = false WHERE id = ?', [id]);

    const res = await POST(
      jsonRequest({ labor: { patients: [laborPatient('AG-INACT-1')] } }, key.rawKey) as never,
    );
    expect(res.status).toBe(403);
  });

  it('serves the sync bootstrap (newborn cutoff) to a key holder', async () => {
    const key = await createApiKey(db, await hospitalId(), 'NN-LRMS agent', AGENT_SCOPES);
    const res = await GET(bootstrapRequest(key.rawKey) as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { newbornCutoff?: string };
    expect(typeof body.newbornCutoff).toBe('string');
  });
});
