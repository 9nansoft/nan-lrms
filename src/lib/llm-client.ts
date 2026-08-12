// Minimal OpenAI-compatible LLM client for the dev-mode simulation generator.
// Points at a self-hosted vLLM instance (default: BMS cloud) serving Gemma-4.
// Reads LLM_BASE_URL + LLM_DEFAULT_MODEL from env so deployments can override.
//
// This client is intentionally thin — no streaming, no function calling, no
// retries with backoff. The simulation engine wraps it with its own error
// handling so individual LLM misfires don't kill the whole simulation.

import { logger } from './logger';

// Default points at the on-prem vLLM on the lab LAN. Override via
// LLM_BASE_URL when deploying off-network (e.g. back to the public
// vllm-qwen.bmscloud.in.th endpoint for cloud demos).
const DEFAULT_BASE_URL = 'http://192.168.50.207:24000/v1';
const DEFAULT_MODEL = 'gemma4';
// 3-minute ceiling for heavy prompts (shift plans, full clinical records
// under JSON schema). vLLM under 26-parallel sim load can take 30-90s per
// response; 180s gives generous headroom while still catching hard hangs.
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_TOKENS = 8000;

/** A tool call the model asked for (OpenAI-compatible shape). */
export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Null on an assistant turn that only carries tool_calls. */
  content: string | null;
  /** Present on role:'tool' — echoes the id of the call being answered. */
  tool_call_id?: string;
  /** Present on an assistant turn that requested tools; must be replayed
   *  verbatim or the server rejects the following tool message as orphaned. */
  tool_calls?: LlmToolCall[];
}

export interface LlmChatOptions {
  model?: string;
  messages: LlmChatMessage[];
  temperature?: number;
  /** Nucleus sampling (DeepSeek V4 spec: 1.0). Only sent when provided. */
  topP?: number;
  /** Top-K (DeepSeek guidance: usually not needed; send <=0 to disable). Only
   *  sent when provided and > 0, to keep strict JSON/dev-simulation unaffected. */
  topK?: number;
  maxTokens?: number;
  /** When true, asks the server to return a strict JSON object. */
  jsonMode?: boolean;
  /** Optional JSON schema for guided generation (vLLM extra_body.guided_json). */
  jsonSchema?: Record<string, unknown>;
  /** Abort signal so callers can cancel in-flight requests. */
  signal?: AbortSignal;
  /** Override the internal request-timeout ceiling (ms). Default 30_000. Use
   *  a larger value for heavy prompts like Tier-3 plan generation. */
  timeoutMs?: number;
  /** Override the API base URL for this call only (chatbot points at the
   *  GLM-5.2 SGLang endpoint without moving dev-simulation's defaults). */
  baseUrl?: string;
  /** Extra JSON fields merged into the OpenAI-compatible request body.
   *  Example: { chat_template_kwargs: { enable_thinking: false } } to disable
   *  GLM-5.2 reasoning (cost: thinking tokens are billed). */
  extraBody?: Record<string, unknown>;
  /** Function tools offered to the model this round. Omit to forbid calls. */
  tools?: ChatCompletionTool[];
  /** 'none' forces a text answer — used on the loop's final round. */
  toolChoice?: 'auto' | 'none' | 'required';
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: LlmToolCall[] };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

/** Raw turn result — unlike llmChat this never throws on empty content, because
 *  a tool-calling reply legitimately has content:null. */
export interface LlmChatRawResult {
  content: string | null;
  toolCalls: LlmToolCall[];
  finishReason?: string;
}

/**
 * Drops tool calls the model emitted malformed.
 *
 * A truncated `arguments` string echoed back into the next request makes the
 * server 400 the WHOLE conversation, so one bad call would kill the turn. An
 * empty string is the model's way of saying "no arguments" → '{}'.
 */
export function sanitizeToolCalls(raw: LlmToolCall[] | undefined): LlmToolCall[] {
  if (!raw?.length) return [];
  const clean: LlmToolCall[] = [];
  for (const call of raw) {
    if (!call?.id || !call.function?.name) continue;
    const args = call.function.arguments?.trim() ?? '';
    if (args === '') {
      clean.push({ ...call, function: { ...call.function, arguments: '{}' } });
      continue;
    }
    try {
      JSON.parse(args);
      clean.push(call);
    } catch {
      logger.warn('llm_tool_call_dropped_malformed_args', { name: call.function.name });
    }
  }
  return clean;
}

export interface LlmModelInfo {
  id: string;
  ownedBy?: string;
  maxContextLen?: number;
}

/** OpenAI-compatible function-tool declaration (for tool/function calling). */
export interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
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
  const body = (await res.json()) as {
    data?: Array<{ id: string; owned_by?: string; max_model_len?: number }>;
  };
  return (body.data ?? []).map((m) => ({
    id: m.id,
    ownedBy: m.owned_by,
    maxContextLen: m.max_model_len,
  }));
}

/**
 * One completion, returned raw. Tool-calling replies carry content:null and
 * finish_reason:'tool_calls' — throwing on those (as llmChat does) is exactly
 * what made every tool-enabled request 502, so the agent loop uses this.
 */
export async function llmChatRaw(opts: LlmChatOptions): Promise<LlmChatRawResult> {
  const key = apiKey();
  const controller = new AbortController();
  // Callers can raise the ceiling (planner's 20-event plan needs ~40s on the
  // shared vLLM). Passing 0 disables the internal timer and defers entirely
  // to the caller-provided signal.
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const t = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  // Merge external signal with internal timeout.
  if (opts.signal) {
    opts.signal.addEventListener('abort', () => controller.abort());
  }
  try {
    const body: Record<string, unknown> = {
      model: opts.model || defaultModel(),
      messages: opts.messages,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
    };
    // DeepSeek V4 sampling — top_p is sent only with a meaningful value; top_k
    // is sent whenever the caller provides it (<=0 = disabled/no-restriction, a
    // valid vLLM sentinel expressing "usually only need temperature").
    if (opts.topP != null && opts.topP > 0) body.top_p = opts.topP;
    if (opts.topK != null) body.top_k = opts.topK;
    if (opts.extraBody) {
      // Caller-supplied extensions (e.g. GLM-5.2 chat_template_kwargs) merged
      // at top level — OpenAI-compatible servers (vLLM, SGLang) accept unknown
      // top-level sampling keys. Never overwrites the fields above.
      Object.assign(body, opts.extraBody);
    }
    if (opts.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (opts.jsonSchema) {
      // vLLM guided-generation extension — server forces output to conform.
      body.extra_body = { guided_json: opts.jsonSchema };
    }
    // Tools are only sent when offered; the loop's final round omits them and
    // sets tool_choice:'none' so the model must produce prose.
    if (opts.tools?.length) body.tools = opts.tools;
    if (opts.toolChoice) body.tool_choice = opts.toolChoice;
    const effectiveBaseUrl = (opts.baseUrl || baseUrl()).replace(/\/+$/, '');
    const res = await fetch(`${effectiveBaseUrl}/chat/completions`, {
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
    const choice = json.choices?.[0];
    return {
      content: choice?.message?.content ?? null,
      toolCalls: sanitizeToolCalls(choice?.message?.tool_calls),
      finishReason: choice?.finish_reason,
    };
  } catch (err) {
    logger.warn('llm_chat_failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  } finally {
    if (t) clearTimeout(t);
  }
}

/**
 * Text-only completion. Throws on an empty answer — the long-standing contract
 * every non-chat caller (dev-simulation planner/generators) relies on to fail
 * loudly rather than emit an empty plan. Tool-callers must use llmChatRaw.
 */
export async function llmChat(opts: LlmChatOptions): Promise<string> {
  const { content } = await llmChatRaw(opts);
  if (!content) throw new Error('LLM returned empty content');
  return content;
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
