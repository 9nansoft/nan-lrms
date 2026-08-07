// Medical knowledge-base (ebook / drug monograph) configuration.
//
// Ported from the reference chatbot at
// /home/manoi/ai_project/bms-ai-chatbot-demo (src/services/tools.ts —
// askKnowledgeLlmAnswer). The service is HOSTED, and auth is the caller's BMS
// session id as a bearer token — the same scheme as the LLM proxy. There is no
// separate API key and no docker-network wiring to do.
//
// Everything is env-overridable (constitution: no hardcoded endpoints).

/** Master switch. Default ON; set CLINICAL_CHAT_KNOWLEDGE_ENABLED="false" to
 *  drop the tool from the surface entirely (it then cannot be called at all). */
export function knowledgeSearchEnabled(): boolean {
  return process.env.CLINICAL_CHAT_KNOWLEDGE_ENABLED !== 'false';
}

/** Streaming Q&A endpoint: POST {message, collection} → SSE token deltas. */
export function knowledgeAnswerUrl(): string {
  return (
    process.env.KNOWLEDGE_LLM_ANSWER_URL?.trim() ||
    'https://knowledge.bmscloud.in.th/ui/api/llm-answer'
  );
}

/** Collections the chatbot may consult. 'ebook-medical' is the medical
 *  textbook corpus (~97k chunks); 'drug-monograph' (~219k) holds drug
 *  monographs. The model picks per question; unknown names are rejected. */
export function knowledgeCollections(): string[] {
  const raw = process.env.CLINICAL_CHAT_KNOWLEDGE_COLLECTIONS?.trim();
  if (!raw) return ['ebook-medical', 'drug-monograph'];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The knowledge service synthesizes an answer, so it is slower than a plain
 *  vector lookup. Bounded so one reference lookup cannot eat the chat turn. */
export function knowledgeTimeoutMs(): number {
  const raw = Number(process.env.CLINICAL_CHAT_KNOWLEDGE_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
}
