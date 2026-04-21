// Minimal OpenAI-compatible LLM client for the dev-mode simulation generator.
// Points at a self-hosted vLLM instance (default: BMS cloud) serving Gemma-4.
// Reads LLM_BASE_URL + LLM_DEFAULT_MODEL from env so deployments can override.
//
// This client is intentionally thin — no streaming, no function calling, no
// retries with backoff. The simulation engine wraps it with its own error
// handling so individual LLM misfires don't kill the whole simulation.

import { logger } from './logger';

const DEFAULT_BASE_URL = 'https://vllm-qwen.bmscloud.in.th/v1';
const DEFAULT_MODEL = 'gemma4';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  model?: string;
  messages: LlmChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** When true, asks the server to return a strict JSON object. */
  jsonMode?: boolean;
  /** Optional JSON schema for guided generation (vLLM extra_body.guided_json). */
  jsonSchema?: Record<string, unknown>;
  /** Abort signal so callers can cancel in-flight requests. */
  signal?: AbortSignal;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export interface LlmModelInfo {
  id: string;
  ownedBy?: string;
  maxContextLen?: number;
}

function baseUrl(): string {
  return (process.env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function defaultModel(): string {
  return process.env.LLM_DEFAULT_MODEL || DEFAULT_MODEL;
}

function apiKey(): string | null {
  return process.env.LLM_API_KEY || null;
}

export async function listLlmModels(signal?: AbortSignal): Promise<LlmModelInfo[]> {
  const key = apiKey();
  const res = await fetch(`${baseUrl()}/models`, {
    method: 'GET',
    headers: key ? { Authorization: `Bearer ${key}` } : undefined,
    signal,
  });
  if (!res.ok) {
    throw new Error(`LLM /models returned ${res.status}`);
  }
  const body = (await res.json()) as { data?: Array<{ id: string; owned_by?: string; max_model_len?: number }> };
  return (body.data ?? []).map((m) => ({
    id: m.id,
    ownedBy: m.owned_by,
    maxContextLen: m.max_model_len,
  }));
}

export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const key = apiKey();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  // Merge external signal with internal timeout.
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort());
  }
  try {
    const body: Record<string, unknown> = {
      model: opts.model || defaultModel(),
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 800,
    };
    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (opts.jsonSchema) {
      // vLLM guided-generation extension — server forces output to conform.
      body.extra_body = { guided_json: opts.jsonSchema };
    }
    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LLM ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as ChatCompletionResponse;
    if (json.error) throw new Error(`LLM error: ${json.error.message}`);
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error('LLM returned empty content');
    return content;
  } catch (err) {
    logger.warn('llm_chat_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Calls `llmChat` with `jsonMode: true` and parses the response as JSON.
 * Throws if the response isn't valid JSON.
 */
export async function llmJson<T>(opts: Omit<LlmChatOptions, 'jsonMode'>): Promise<T> {
  const raw = await llmChat({ ...opts, jsonMode: true });
  // Some models wrap JSON in markdown code fences; strip them defensively.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new Error(`LLM JSON parse failed: ${cleaned.slice(0, 200)}`);
  }
}
