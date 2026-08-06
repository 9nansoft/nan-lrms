// TDD — /api/chat request guardrails (2026-08-06).
//
// The chat route is the only unmetered LLM surface in the app, and the tool
// loop multiplies its cost per turn. Three holes closed here:
//   1. no rate limit  → one user could pin the shared GPU indefinitely
//   2. no PDPA audit  → a clinician can query patient context with no trail
//   3. no CID scrub   → a nurse pasting a 13-digit national ID ships it verbatim
//      to the inference server AND into the Redis transcript
// maskCid() is anchored (/^\d{13}$/ in pii-mask.ts) so it cannot mask an
// embedded ID; the scrub must find them with a boundary-guarded pattern.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testSessionUser } from '../../helpers/session';

let mockSessionUser: Record<string, unknown> | null = null;
const auditCalls: Array<Record<string, unknown>> = [];
const rateCalls: Array<{ key: string; limit: number; window: number }> = [];
let rateAllowed = true;

vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));
vi.mock('@/db/connection', () => ({
  getDatabase: async () => ({ query: async () => [] }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async (key: string, limit: number, window: number) => {
    rateCalls.push({ key, limit, window });
    return { allowed: rateAllowed, remaining: rateAllowed ? 1 : 0 };
  },
}));
vi.mock('@/services/audit', () => ({
  tryLogAccess: async (_db: unknown, entry: Record<string, unknown>) => {
    auditCalls.push(entry);
  },
}));
// The chat service itself is exercised elsewhere; here we only care about what
// the route hands it and what it does around it.
const serviceCalls: Array<{ question: string }> = [];
vi.mock('@/services/chat/chat-service', () => ({
  askClinicalQuestion: async (question: string) => {
    serviceCalls.push({ question });
    return { answer: 'ok' };
  },
}));

import { POST } from '@/app/api/chat/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat — rate limit, audit trail, CID scrub', () => {
  beforeEach(() => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670' });
    auditCalls.length = 0;
    rateCalls.length = 0;
    serviceCalls.length = 0;
    rateAllowed = true;
    delete process.env.CLINICAL_CHAT_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rate-limits per user and returns 429 with an actionable Thai message', async () => {
    rateAllowed = false;
    const res = await POST(jsonRequest({ message: 'สวัสดี' }) as never);
    expect(res.status).toBe(429);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/[ก-๙]/); // Thai, not a bare code
    expect(rateCalls).toHaveLength(1);
    expect(rateCalls[0].limit).toBeGreaterThan(0);
    // The LLM must never be reached when rate-limited.
    expect(serviceCalls).toHaveLength(0);
  });

  it('never puts a raw user identifier in the rate-limit key', async () => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670' });
    (mockSessionUser as { id?: string }).id = undefined;
    (mockSessionUser as { userCid?: string }).userCid = '3320500282121';
    await POST(jsonRequest({ message: 'สวัสดี' }) as never);
    expect(rateCalls[0].key).not.toContain('3320500282121');
  });

  it('masks an embedded 13-digit CID before the message leaves the process', async () => {
    await POST(jsonRequest({ message: 'ผู้ป่วย 3320500282121 คลอดหรือยัง' }) as never);
    expect(serviceCalls).toHaveLength(1);
    expect(serviceCalls[0].question).not.toContain('3320500282121');
    expect(serviceCalls[0].question).toContain('3XXXXXXXX2121');
    // Non-CID digit runs survive untouched.
    expect(serviceCalls[0].question).toContain('ผู้ป่วย');
  });

  it('leaves 12- and 14-digit numbers alone (no over-masking)', async () => {
    await POST(jsonRequest({ message: 'เลข 332050028212 และ 33205002821212' }) as never);
    expect(serviceCalls[0].question).toContain('332050028212');
    expect(serviceCalls[0].question).toContain('33205002821212');
  });

  it('writes one audit entry per answered turn, without the question text', async () => {
    await POST(jsonRequest({ message: 'ตอนนี้มีคนรอคลอดกี่คน', mode: 'statistics' }) as never);
    expect(auditCalls).toHaveLength(1);
    expect(auditCalls[0].action).toBe('CHAT_QUERY');
    expect(auditCalls[0].hospitalCode).toBe('10670');
    // The question can contain clinical detail — the trail records that a query
    // happened and by whom, never the content.
    expect(JSON.stringify(auditCalls[0])).not.toContain('รอคลอด');
  });
});
