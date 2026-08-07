// TDD — medical knowledge-base lookup (2026-08-06).
//
// Contract ported from the reference chatbot
// (/home/manoi/ai_project/bms-ai-chatbot-demo, src/services/tools.ts →
// askKnowledgeLlmAnswer): POST {message, collection} with
// `Authorization: Bearer <BMS session id>`, response is SSE where every
// `token` frame carries a `delta` to concatenate, `usage` carries token counts
// and a cache flag, `error` frames must throw, `done` ends the stream, and
// `:`-prefixed heartbeats are ignored.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { askKnowledgeLlmAnswer } from '@/services/chat/knowledge-client';

/** Builds an SSE body from frames, exactly as the service emits them. */
function sseResponse(frames: string[]): Response {
  const body = frames.map((f) => `${f}\n\n`).join('');
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

const ev = (type: string, data: Record<string, unknown> = {}) =>
  `event: message\ndata: ${JSON.stringify({ type, data })}`;

describe('askKnowledgeLlmAnswer — SSE contract', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('concatenates token deltas and returns the answer with usage', async () => {
    const fetchMock = vi.fn(async () =>
      sseResponse([
        ': heartbeat',
        ev('token', { delta: 'ภาวะตกเลือดหลังคลอด' }),
        ': heartbeat',
        ev('token', { delta: ' คือการเสียเลือด >500 ml' }),
        ev('usage', { prompt_tokens: 120, completion_tokens: 40, cached: false }),
        ev('done'),
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const res = await askKnowledgeLlmAnswer('ภาวะตกเลือดหลังคลอด', {
      sessionId: 'bms-session-abc',
      collection: 'ebook-medical',
    });

    expect(res.answer).toBe('ภาวะตกเลือดหลังคลอด คือการเสียเลือด >500 ml');
    expect(res.promptTokens).toBe(120);
    expect(res.completionTokens).toBe(40);
    expect(res.cached).toBe(false);

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer bms-session-abc');
    expect(headers.Accept).toBe('text/event-stream');
    expect(JSON.parse(String(init.body))).toMatchObject({
      message: 'ภาวะตกเลือดหลังคลอด',
      collection: 'ebook-medical',
    });
  });

  it('throws on an error frame rather than returning a partial answer', async () => {
    vi.stubGlobal('fetch', async () =>
      sseResponse([ev('token', { delta: 'partial' }), ev('error', { message: 'kb offline' })]),
    );
    await expect(
      askKnowledgeLlmAnswer('q', { sessionId: 's', collection: 'ebook-medical' }),
    ).rejects.toThrow(/kb offline/);
  });

  it('tolerates a malformed frame instead of losing the whole answer', async () => {
    vi.stubGlobal('fetch', async () =>
      sseResponse(['event: message\ndata: {not json', ev('token', { delta: 'ok' }), ev('done')]),
    );
    const res = await askKnowledgeLlmAnswer('q', {
      sessionId: 's',
      collection: 'ebook-medical',
    });
    expect(res.answer).toBe('ok');
  });

  it('refuses without a BMS session id — never calls the service anonymously', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      askKnowledgeLlmAnswer('q', { sessionId: null, collection: 'ebook-medical' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a collection outside the configured allow-list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      askKnowledgeLlmAnswer('q', { sessionId: 's', collection: 'daily-report' }),
    ).rejects.toThrow(/collection/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('surfaces an HTTP failure with its status', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: false,
      status: 502,
      text: async () => 'bad gateway',
    }));
    await expect(
      askKnowledgeLlmAnswer('q', { sessionId: 's', collection: 'ebook-medical' }),
    ).rejects.toThrow(/502/);
  });

  it('scrubs a 13-digit national ID out of the question before it leaves', async () => {
    const fetchMock = vi.fn(async () => sseResponse([ev('token', { delta: 'x' }), ev('done')]));
    vi.stubGlobal('fetch', fetchMock);
    await askKnowledgeLlmAnswer('ผู้ป่วย 3320500282121 มีภาวะอะไร', {
      sessionId: 's',
      collection: 'ebook-medical',
    });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(init.body)).not.toContain('3320500282121');
  });
});
