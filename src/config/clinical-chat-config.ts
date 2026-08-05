// Clinical-chatbot configuration.
//
// Single source of truth for the chatbot's tunables and the GLM-5.2 inference
// endpoint. GLM-5.2 has compute cost, so the whole feature is OPT-IN and
// default-OFF — the strictly inverted default vs MOPH_ALERTS_ENABLED is
// intentional: alerts are safety-mandated, a chatbot is a cost-incurring
// convenience (constitution: no hardcoded conditions/URLs).

/** Master switch. When false the chat UI and /api/chat routes short-circuit 503
 *  and NEVER call the LLM (no fetch — a misconfigured deploy cannot burn compute). */
export function clinicalChatEnabled(): boolean {
  return process.env.CLINICAL_CHAT_ENABLED === 'true';
}

/** GLM-5.2 inference endpoint (SGLang, OpenAI-compatible). */
export function clinicalChatBaseUrl(): string {
  return process.env.CLINICAL_CHAT_BASE_URL?.trim() || 'https://sglang-glm.bmscloud.in.th/v1';
}

/** Model served by clinicalChatBaseUrl(). */
export function clinicalChatModel(): string {
  return process.env.CLINICAL_CHAT_MODEL?.trim() || 'glm-5.2';
}

export interface ClinicalChatLimits {
  /** Hard ceiling on completion tokens per request — cost lever #1 alongside
   *  enable_thinking:false (reasoning tokens are billed and can eat the whole
   *  budget if left unbounded). */
  maxTokensPerRequest: number;
  /** Per-request HTTP timeout (ms). SGLang can be slow under load. */
  timeoutMs: number;
}

export function clinicalChatLimits(): ClinicalChatLimits {
  return {
    maxTokensPerRequest: numEnv('CLINICAL_CHAT_MAX_TOKENS', 400),
    timeoutMs: numEnv('CLINICAL_CHAT_TIMEOUT_MS', 60_000),
  };
}

function numEnv(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}
