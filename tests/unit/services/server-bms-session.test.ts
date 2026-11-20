// The server's own HOSxP session.
//
// The server pulls a hospital's data over the BMS tunnel, so it needs a
// bearer the gateway accepts. A stored session can be unexpired and still
// refused ("Not Implemented — Authorization Error" — the marketplace
// rotated the bearer behind our back), so a client that hands us a LIVE
// session id must be able to force the exchange.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { randomUUID } from 'crypto';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

const validateSession = vi.fn();
const getSessionId = vi.fn();

vi.mock('@/lib/bms-session', () => ({
  BmsSessionClient: class {
    async getSessionId() {
      return getSessionId();
    }
    async validateSession(sessionId: string, validateUrl: string) {
      return validateSession(sessionId, validateUrl);
    }
  },
}));

vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { serverBmsSession } from '@/services/sync/maternity-assessment';

let db: DatabaseAdapter;

const HCODE = '10670';
const TUNNEL = 'https://10670-saciw.tunnel.hosxp.net';

async function seedConfig(opts: { jwt?: string | null; expiresAt?: string | null }): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE]);
  const hospitalId = rows[0].id;
  await db.execute(
    `INSERT INTO hospital_bms_config
       (id, hospital_id, tunnel_url, session_jwt, session_expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      hospitalId,
      TUNNEL,
      opts.jwt ?? 'stored-jwt',
      opts.expiresAt ?? new Date(Date.now() + 3600_000).toISOString(),
      new Date().toISOString(),
      new Date().toISOString(),
    ],
  );
  return hospitalId;
}

describe('serverBmsSession', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    validateSession.mockReset();
    getSessionId.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns nothing when the hospital has no tunnel', async () => {
    const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE]);
    const session = await serverBmsSession(db, rows[0].id, { bmsSessionId: 'SID-1' });
    expect(session).toBeNull();
  });

  it('uses the stored session while it is still valid', async () => {
    const hospitalId = await seedConfig({});
    const session = await serverBmsSession(db, hospitalId);
    expect(session?.jwt).toBe('stored-jwt');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('exchanges a pushed session id even when the stored one is still valid', async () => {
    const hospitalId = await seedConfig({});
    validateSession.mockResolvedValue({
      jwt: 'fresh-jwt',
      expiresAt: new Date(Date.now() + 3600_000),
      bmsUrl: TUNNEL,
      userInfo: { hospital_code: HCODE },
    });

    const session = await serverBmsSession(db, hospitalId, {
      bmsSessionId: 'SID-FRESH',
      forceRefresh: true,
    });

    expect(validateSession).toHaveBeenCalledWith('SID-FRESH', expect.any(String));
    expect(session?.jwt).toBe('fresh-jwt');

    // …and the fresh bearer is what the server keeps.
    const rows = await db.query<{ session_jwt: string }>(
      'SELECT session_jwt FROM hospital_bms_config WHERE hospital_id = ?',
      [hospitalId],
    );
    expect(rows[0].session_jwt).toBe('fresh-jwt');
  });

  it('refuses a pushed session that belongs to another hospital', async () => {
    const hospitalId = await seedConfig({});
    validateSession.mockResolvedValue({
      jwt: 'other-jwt',
      expiresAt: new Date(Date.now() + 3600_000),
      bmsUrl: TUNNEL,
      userInfo: { hospital_code: '10999' },
    });

    const session = await serverBmsSession(db, hospitalId, {
      bmsSessionId: 'SID-OTHER',
      forceRefresh: true,
    });

    // Falls back to the stored session rather than adopting a foreign one.
    expect(session?.jwt).toBe('stored-jwt');
  });
});
