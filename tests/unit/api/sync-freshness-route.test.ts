import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
const freshnessMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: vi.fn() }));
vi.mock('@/db/connection', () => ({ getDatabase: vi.fn(async () => ({})) }));
vi.mock('@/services/sync-freshness', () => ({
  getSyncFreshness: (...a: unknown[]) => freshnessMock(...a),
}));

import { GET } from '@/app/api/sync/freshness/route';

describe('GET /api/sync/freshness', () => {
  beforeEach(() => {
    authMock.mockReset();
    freshnessMock.mockReset();
  });

  it('401 without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(freshnessMock).not.toHaveBeenCalled();
  });

  it('scopes by the session hcode — never a client-supplied one', async () => {
    authMock.mockResolvedValue({ user: { hospitalCode: '11002', role: 'NURSE' } });
    freshnessMock.mockResolvedValue({ generatedAt: 'x', province: {}, own: null });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(freshnessMock).toHaveBeenCalledWith(expect.anything(), { hcode: '11002' });
  });

  it('500 with an actionable Thai message when the service throws', async () => {
    authMock.mockResolvedValue({ user: { hospitalCode: '11002', role: 'NURSE' } });
    freshnessMock.mockRejectedValue(new Error('db down'));
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.message).toMatch(/ลองใหม่/);
  });
});
