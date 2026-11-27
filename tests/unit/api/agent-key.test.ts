import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mockDb = {
  query: vi.fn(async () => [{ id: 'hosp-10670' }]),
  execute: vi.fn(async () => ({ rowCount: 1 })),
};

vi.mock('@/db/connection', () => ({ getDatabase: async () => mockDb }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));
vi.mock('@/lib/admin-guard', () => ({
  requireAdmin: async () => ({ session: { user: { id: 'admin-1', role: 'ADMIN' } } }),
}));

import { POST } from '@/app/api/admin/hospitals/[hcode]/agent-key/route';

describe('POST /api/admin/hospitals/[hcode]/agent-key', () => {
  const origNextAuthUrl = process.env.NEXTAUTH_URL;
  const origPublicUrl = process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL;

  beforeEach(() => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL;
    mockDb.query.mockClear();
    mockDb.execute.mockClear();
  });

  afterEach(() => {
    if (origNextAuthUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = origNextAuthUrl;

    if (origPublicUrl === undefined) delete process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL;
    else process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL = origPublicUrl;
  });

  it('uses NEXTAUTH_URL for agentConfig.serverUrl and trims trailing slashes', async () => {
    process.env.NEXTAUTH_URL = 'https://nan-lrms.moph.go.th/';
    process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL = 'https://other.example.com';

    const req = new NextRequest('http://127.0.0.1:3000/api/admin/hospitals/10670/agent-key', {
      method: 'POST',
    });
    const res = await POST(req, { params: Promise.resolve({ hcode: '10670' }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.agentConfig.serverUrl).toBe('https://nan-lrms.moph.go.th');
    expect(json.agentConfig.apiKey).toBe(json.key);
  });

  it('falls back to forwarded host/proto when env vars are unset', async () => {
    const req = new NextRequest('http://127.0.0.1:3000/api/admin/hospitals/10670/agent-key', {
      method: 'POST',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'lrms-nan.hospital.local',
      },
    });
    const res = await POST(req, { params: Promise.resolve({ hcode: '10670' }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.agentConfig.serverUrl).toBe('https://lrms-nan.hospital.local');
  });
});
