// Clinical-chatbot service — the single place that talks to GLM-5.2 for the
// chat feature (business logic lives in services, never in route handlers:
// constitution IV). Phase 0 = thin non-streaming chat. Phase 1+ will add
// context builder + redactor + memory here without changing the route shape.
import { llmChat, type LlmChatMessage } from '@/lib/llm-client';
import {
  clinicalChatBaseUrl,
  clinicalChatModel,
  clinicalChatLimits,
} from '@/config/clinical-chat-config';
import { buildChatContext, type ChatContext } from './context-builder';
import { clinicalSystemPrompt, renderContextBlock } from './prompt-config';
import { getChatHistory, appendChatTurn } from './memory-store';
import type { DatabaseAdapter } from '@/db/adapter';

export interface ChatReply {
  answer: string;
}

export interface ChatServiceDeps {
  db: DatabaseAdapter;
  /** Session hospital code — RAG scope. Null skips patient context (header-only chat). */
  hospitalCode?: string;
  /** Session user id — enables bounded multi-turn memory (Redis TTL). */
  userId?: string;
}

/**
 * Sends a single-turn Thai clinical question to GLM-5.2 with thinking DISABLED
 * (extra_body.chat_template_kwargs.enable_thinking=false — SGLang GLM-5.2 is a
 * reasoning model and billed reasoning tokens can eat the entire max_tokens
 * budget before a visible answer appears) and a hard max_tokens cap (cost
 * lever #1). The endpoint/model/limits come from config, never literals.
 *
 * Phase 1: when a hospitalCode is provided, a PDPA-redacted patient context
 * block (masked name/CID, clinical fields only) is built and injected into the
 * user turn so the model answers with the hospital's own patients in scope.
 */
export async function askClinicalQuestion(
  question: string,
  deps: ChatServiceDeps,
): Promise<ChatReply> {
  const limits = clinicalChatLimits();
  const context = await buildChatContext(deps.db, deps.hospitalCode ?? '');
  const contextBlock = renderContextBlock(context);
  const userTurn = contextBlock ? `${contextBlock}\n\nคำถาม: ${question}` : question;

  // Multi-turn: pull bounded masked history (Redis TTL) and append this turn.
  const history = deps.userId ? await getChatHistory(deps.userId) : [];
  const messages: LlmChatMessage[] = [
    { role: 'system', content: clinicalSystemPrompt() },
    ...history.map((t) => ({ role: t.role, content: t.content }) as LlmChatMessage),
    { role: 'user', content: userTurn },
  ];

  const answer = await llmChat({
    model: clinicalChatModel(),
    baseUrl: clinicalChatBaseUrl(),
    messages,
    temperature: 0.3,
    maxTokens: limits.maxTokensPerRequest,
    timeoutMs: limits.timeoutMs,
    extraBody: {
      chat_template_kwargs: { enable_thinking: false },
    },
  });

  // Persist the turn pair (masked transcript only) so context stays bounded.
  if (deps.userId) {
    await appendChatTurn(deps.userId, { role: 'user', content: userTurn });
    await appendChatTurn(deps.userId, { role: 'assistant', content: answer });
  }
  return { answer };
}
