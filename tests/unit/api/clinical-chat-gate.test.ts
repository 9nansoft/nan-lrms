// TDD for the clinical-chatbot cost gate + GLM smoke (plan:
// docs/superpowers/plans/2026-08-03-clinical-chatbot-glm.md). The chatbot is
// opt-in via CLINICAL_CHAT_ENABLED (default OFF — GLM-5.2 has compute cost).
// When disabled the route must short-circuit 503 WITHOUT calling the LLM
// (proven by asserting global.fetch is never invoked). When enabled + mocked
// GLM, the outbound request must carry extra_body.chat_template_kwargs.
// enable_thinking:false (cost lever #1 — SGLang GLM-5.2 is a reasoning model;
// thinking tokens are billed and can eat the entire max_tokens budget).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { testSessionUser } from '../../helpers/session';

let mockSessionUser: Record<string, unknown> | null = null;
const ORIG_FLAG = process.env.CLINICAL_CHAT_ENABLED;

vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));
vi.mock('@/db/connection', () => ({
  getDatabase: async () => ({ query: async () => [] }),
}));

import { POST } from '@/app/api/chat/route';

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chat — cost gate + GLM smoke', () => {
  beforeEach(() => {
    mockSessionUser = testSessionUser({ hospitalCode: '10670' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIG_FLAG === undefined) delete process.env.CLINICAL_CHAT_ENABLED;
    else process.env.CLINICAL_CHAT_ENABLED = ORIG_FLAG;
  });

  it('rejects anonymous sessions (401/403)', async () => {
    mockSessionUser = null;
    delete process.env.CLINICAL_CHAT_ENABLED;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(jsonRequest({ message: 'สวัสดี' }) as never);
    expect(res.status).toBeGreaterThanOrEqual(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flag unset -> 503 Thai message, LLM never called', async () => {
    delete process.env.CLINICAL_CHAT_ENABLED;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(jsonRequest({ message: 'สวัสดี' }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('ปิดใช้งานผู้ช่วยแชททางคลินิก');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flag "false" -> 503 Thai message, LLM never called', async () => {
    process.env.CLINICAL_CHAT_ENABLED = 'false';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await POST(jsonRequest({ message: 'สวัสดี' }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('ปิดใช้งานผู้ช่วยแชททางคลินิก');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flag "true" -> GLM called with enable_thinking:false, returns answer', async () => {
    process.env.CLINICAL_CHAT_ENABLED = 'true';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: { content: 'ความดัน 140/90 ถือเป็นความเสี่ยงสูง', finish_reason: 'stop' },
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 8 },
          }),
          { status: 200 },
        ),
      ),
    );
    const res = await POST(jsonRequest({ message: 'ความดัน 140/90 อันตรายไหม?' }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.answer).toContain('ความดัน 140/90');

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(String(url)).toContain('/v1/chat/completions');
    const sent = JSON.parse(init.body) as {
      model?: string;
      chat_template_kwargs?: { enable_thinking?: boolean };
    };
    // Top-level field, not nested under extra_body — SGLang reads GLM-5.2's
    // chat_template_kwargs as a body-level sampling param.
    expect(sent.chat_template_kwargs?.enable_thinking).toBe(false);
    expect(sent.model).toBe('glm-5.2');
  });
});
