// Medical knowledge-base client — lets the chatbot consult real references
// (medical textbooks, drug monographs) instead of answering clinical questions
// from model weights alone.
//
// PORTED from the reference chatbot at /home/manoi/ai_project/bms-ai-chatbot-demo
// (src/services/tools.ts → askKnowledgeLlmAnswer). Do not redesign this against
// the local knowledge-mcp container: the service is HOSTED and authenticates
// with the caller's BMS session id, so there is no API key to provision and no
// docker network to join.
//
// The endpoint SYNTHESIZES an answer from the retrieved chunks and streams it
// as SSE, so this returns prose the chat model then restates in context — the
// retrieval, ranking and Thai handling all stay server-side where they are
// already implemented and tuned.
//
// PDPA: the question text leaves this process. Callers must pass a clinical
// question, never a patient record; national IDs are scrubbed here as a
// backstop (defense in depth — /api/chat scrubs the user message too).
import { maskCidsInText } from '@/lib/pii-mask';
import {
  knowledgeAnswerUrl,
  knowledgeCollections,
  knowledgeTimeoutMs,
} from '@/config/knowledge-config';

export interface KnowledgeAnswer {
  answer: string;
  collection: string;
  cached?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export interface KnowledgeAskOptions {
  /** BMS session id — the bearer token. No session ⇒ no call (never anonymous). */
  sessionId: string | null | undefined;
  collection: string;
  signal?: AbortSignal;
}

/**
 * Ask the knowledge base a clinical question and return its synthesized answer.
 *
 * Throws (rather than returning an empty answer) on: missing session, a
 * collection outside the allow-list, a non-2xx response, or an `error` frame —
 * the tool layer converts those into a refusal the model can read.
 */
export async function askKnowledgeLlmAnswer(
  question: string,
  options: KnowledgeAskOptions,
): Promise<KnowledgeAnswer> {
  const { sessionId, collection, signal } = options;
  if (!sessionId) {
    throw new Error(
      'ไม่มี BMS session — การค้นตำราแพทย์ต้องใช้ session ของผู้ใช้ (เปิดระบบผ่าน BMS อีกครั้ง)',
    );
  }
  const allowed = knowledgeCollections();
  if (!allowed.includes(collection)) {
    throw new Error(`collection "${collection}" ไม่อยู่ในรายการที่อนุญาต (${allowed.join(', ')})`);
  }

  const message = maskCidsInText(question);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), knowledgeTimeoutMs());
  if (signal) signal.addEventListener('abort', () => controller.abort());

  try {
    const res = await fetch(knowledgeAnswerUrl(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sessionId}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message, collection }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Knowledge LLM-answer HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`,
      );
    }
    if (!res.body) throw new Error('Knowledge LLM-answer returned no body');
    return await readAnswerStream(res.body, collection);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads the SSE stream. Frames are separated by a blank line; each carries one
 * `data:` JSON payload. Heartbeats (`: ...`) and unparseable frames are skipped
 * — a single bad frame must not cost the whole answer.
 */
async function readAnswerStream(
  body: ReadableStream<Uint8Array>,
  collection: string,
): Promise<KnowledgeAnswer> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let answer = '';
  const out: KnowledgeAnswer = { answer: '', collection };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const dataLine = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!dataLine) continue; // heartbeat or comment
      const raw = dataLine.slice(5).trim();
      if (!raw) continue;
      let event: { type?: string; data?: Record<string, unknown> };
      try {
        event = JSON.parse(raw) as typeof event;
      } catch {
        continue; // tolerate a malformed frame
      }
      if (event.type === 'token') {
        const delta = (event.data as { delta?: unknown } | undefined)?.delta;
        if (typeof delta === 'string') answer += delta;
      } else if (event.type === 'usage') {
        const u = event.data as
          { prompt_tokens?: number; completion_tokens?: number; cached?: boolean } | undefined;
        if (u?.prompt_tokens !== undefined) out.promptTokens = u.prompt_tokens;
        if (u?.completion_tokens !== undefined) out.completionTokens = u.completion_tokens;
        if (u?.cached !== undefined) out.cached = u.cached;
      } else if (event.type === 'error') {
        const msg = (event.data as { message?: string } | undefined)?.message ?? 'unknown';
        throw new Error(`Knowledge LLM-answer error event: ${msg}`);
      } else if (event.type === 'done') {
        out.answer = answer;
        return out;
      }
    }
  }
  out.answer = answer;
  return out;
}
