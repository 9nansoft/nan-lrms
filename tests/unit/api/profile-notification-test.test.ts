// TDD (Red→Green) for POST /api/profile/notification-test — the "ทดสอบส่งข้อความ"
// self-test button on the profile page. Sends ONE message to the session user's
// own CID through the configured transport and returns the outcome inline, so a
// user can verify their LINE delivery (and an operator can see transport
// config problems) without staging a two-account consult test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

// Mock both senders — the service picks one via MOPH_TRANSPORT.
const mockSendPrompt = vi.fn();
vi.mock('@/services/moph-prompt', () => ({
  sendMophPrompt: (...args: unknown[]) => mockSendPrompt(...args),
}));
const mockSendTemplate = vi.fn();
vi.mock('@/services/moph-alert-v31', () => ({
  sendMophTemplateAlert: (...args: unknown[]) => mockSendTemplate(...args),
}));

// bms transport resolves a per-hospital session — never hit a real tunnel.
const mockResolveSession = vi.fn();
vi.mock('@/lib/bms-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bms-session')>('@/lib/bms-session');
  return {
    ...actual,
    resolveSessionIdForHospital: (...args: unknown[]) => mockResolveSession(...args),
  };
});

import { POST } from '@/app/api/profile/notification-test/route';

function req(): Request {
  return new Request('http://test/api/profile/notification-test', { method: 'POST' });
}

function setV31Env(template = 'แจ้งเตือนLRMS'): void {
  process.env.MOPH_TRANSPORT = 'v3.1';
  process.env.MOPH_ALERT_CLIENT_KEY = 'ck-test';
  process.env.MOPH_ALERT_SECRET_KEY = 'sk-test';
  process.env.MOPH_ALERT_TEMPLATE = template;
}

describe('POST /api/profile/notification-test', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: '10670' });
    mockSendTemplate.mockResolvedValue({ messageId: 'msg-1', success: true });
    mockSendPrompt.mockResolvedValue({
      messageId: 'msg-bms',
      line: { success: true, status: 'success' },
    });
    mockResolveSession.mockResolvedValue('SESS-OK');
    delete process.env.MOPH_TRANSPORT;
    delete process.env.MOPH_ALERT_TEMPLATE;
    delete process.env.MOPH_ALERT_CLIENT_KEY;
    delete process.env.MOPH_ALERT_SECRET_KEY;
  });
  afterEach(() => {
    // clearAllMocks (not restoreAllMocks): in Vitest 4 restore does not reset
    // call history of vi.fn() factories, so one test's send would leak into
    // the next test's "never called" assertion.
    vi.clearAllMocks();
    for (const k of [
      'MOPH_TRANSPORT',
      'MOPH_ALERT_TEMPLATE',
      'MOPH_ALERT_CLIENT_KEY',
      'MOPH_ALERT_SECRET_KEY',
    ]) {
      delete process.env[k];
    }
  });

  it('401 when anonymous', async () => {
    mockSessionUser = null;
    const res = await POST(req() as never);
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockSendPrompt).not.toHaveBeenCalled();
  });

  it('400 when the session has no usable CID', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670', userCid: '' });
    const res = await POST(req() as never);
    expect(res.status).toBe(400);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it('v3.1: sends the test message to the session CID and reports ok with message id', async () => {
    setV31Env();
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; transport: string; messageId: string | null };
    expect(body.ok).toBe(true);
    expect(body.transport).toBe('v3.1');
    expect(body.messageId).toBe('msg-1');
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
    const arg = mockSendTemplate.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.cid).toBe('1100500090006'); // session identity, not client-supplied
    expect(arg.name).toBe('พว.ทดสอบ ระบบ');
    expect(String(arg.messageHtml)).toContain('ทดสอบ');
    expect(String(arg.messageText)).toContain('ทดสอบ');
    expect(mockSendPrompt).not.toHaveBeenCalled();
  });

  it('v3.1: unconfigured template → ok:false with a config detail, no send', async () => {
    process.env.MOPH_TRANSPORT = 'v3.1';
    process.env.MOPH_ALERT_CLIENT_KEY = 'ck-test';
    process.env.MOPH_ALERT_SECRET_KEY = 'sk-test';
    process.env.MOPH_ALERT_TEMPLATE = ''; // ← the exact state that ate the PRD test
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toMatch(/template|MOPH_ALERT_TEMPLATE/i);
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it('v3.1: sender maps 422 to a Thai validation detail', async () => {
    setV31Env();
    mockSendTemplate.mockRejectedValue(
      Object.assign(new Error('template not found'), { code: 'VALIDATION', statusCode: 422 }),
    );
    const res = await POST(req() as never);
    const body = (await res.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toMatch(/template/);
  });

  it('bms: resolves the hospital session then sends, ok on line.success', async () => {
    process.env.MOPH_TRANSPORT = 'bms';
    const res = await POST(req() as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; transport: string };
    expect(body.ok).toBe(true);
    expect(body.transport).toBe('bms');
    expect(mockResolveSession).toHaveBeenCalledTimes(1);
    expect(mockSendPrompt).toHaveBeenCalledTimes(1);
    const arg = mockSendPrompt.mock.calls[0][0] as Record<string, unknown>;
    expect(arg.sessionId).toBe('SESS-OK');
    expect(arg.cid).toBe('1100500090006');
  });

  it('bms: no tunnel configured → ok:false with a session detail, no send', async () => {
    process.env.MOPH_TRANSPORT = 'bms';
    mockResolveSession.mockRejectedValue(new Error('no tunnel'));
    const res = await POST(req() as never);
    const body = (await res.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toMatch(/BMS|tunnel|session/i);
    expect(mockSendPrompt).not.toHaveBeenCalled();
  });
});
