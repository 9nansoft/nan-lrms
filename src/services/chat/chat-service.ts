// Clinical-chatbot service — the single place that talks to GLM-5.2 for the
// chat feature (business logic lives in services, never in route handlers:
// constitution IV). Phase 0 = thin non-streaming chat. Phase 1+ will add
// context builder + redactor + memory here without changing the route shape.
import { type LlmChatMessage } from '@/lib/llm-client';
import { logger } from '@/lib/logger';
import { runChatTurn } from './agent-loop';
import { chatToolsForMode, runChatTool, type ChatToolContext } from './tool-registry';
import {
  clinicalChatBaseUrl,
  clinicalChatModel,
  clinicalChatLimits,
} from '@/config/clinical-chat-config';
import { buildChatContext } from './context-builder';
import {
  clinicalSystemPrompt,
  statisticsSystemPrompt,
  renderContextBlock,
  type ClinicalChatMode,
} from './prompt-config';
import { buildStatisticsContext } from './stats-context-builder';
import { getChatHistory, appendChatTurn, type ChatMemoryScope } from './memory-store';
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
  /** Chat mode: 'clinical' (maternity ward, per-patient RAG) is the default;
   *  'statistics' (dashboard) injects deterministic aggregate counts. */
  mode?: ClinicalChatMode;
  /** BMS session id forwarded from the browser — bearer for the hosted medical
   *  knowledge base (ask_medical_ebook). Absent ⇒ that tool refuses in-band. */
  bmsSessionId?: string | null;
}

/**
 * Sends a single-turn Thai clinical question to the self-hosted
 * DeepSeek-V4-Flash endpoint with reasoning (thinking) ENABLED by default
 * (extra_body.chat_template_kwargs.enable_thinking from config — DeepSeek
 * sampling params only take effect while thinking is on) and a hard max_tokens
 * cap (cost lever #1; 8k covers reasoning tokens). The endpoint/model/limits
 * all come from config, never literals.
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
  const isStats = deps.mode === 'statistics';
  // Statistics mode: deterministic aggregate counts (no PHI lists). Clinical
  // (default): hospital-scoped PDPA-redacted patient RAG.
  // NOTE: deps.hospitalCode is the session HCODE. Both builders take an hcode —
  // passing hospitals.id here is the 2026-08-06 regression (empty context →
  // "ไม่มีข้อมูล"). Statistics mode is province-wide, so it is built even when
  // the session has no hospital scope; clinical mode needs a hospital.
  const contextBlock = isStats
    ? (await buildStatisticsContext(deps.db, deps.hospitalCode)).context
    : deps.hospitalCode
      ? renderContextBlock(await buildChatContext(deps.db, deps.hospitalCode))
      : '';
  const userTurn = contextBlock ? `${contextBlock}\n\nคำถาม: ${question}` : question;

  // Multi-turn: pull bounded masked history (Redis TTL) and append this turn.
  // The bucket is scoped by mode + hospital so a ward conversation and a
  // dashboard conversation never share a transcript.
  const scope: ChatMemoryScope | null = deps.userId
    ? {
        userId: deps.userId,
        mode: isStats ? 'statistics' : 'clinical',
        hospitalCode: deps.hospitalCode,
      }
    : null;
  const history = scope ? await getChatHistory(scope) : [];
  const messages: LlmChatMessage[] = [
    { role: 'system', content: isStats ? statisticsSystemPrompt() : clinicalSystemPrompt() },
    ...history.map((t) => ({ role: t.role, content: t.content }) as LlmChatMessage),
    { role: 'user', content: userTurn },
  ];

  // The turn runs as a bounded tool loop: the injected block answers the common
  // questions in round 0 with zero extra latency, and anything it doesn't cover
  // (trends, per-hospital comparisons, "what's overdue", a specific HN) is
  // FETCHED instead of guessed. Tool surface is per-mode and config-driven.
  const toolContext: ChatToolContext = {
    db: deps.db,
    hospitalCode: deps.hospitalCode,
    mode: isStats ? 'statistics' : 'clinical',
    bmsSessionId: deps.bmsSessionId,
    budget: new Map(),
    ledger: [],
  };
  const { answer, toolTrace } = await runChatTurn({
    messages,
    tools: chatToolsForMode(toolContext.mode),
    maxRounds: limits.maxToolRounds,
    executeTool: (name, args) => runChatTool(toolContext, name, args),
    model: clinicalChatModel(),
    baseUrl: clinicalChatBaseUrl(),
    temperature: limits.temperature,
    topP: limits.topP,
    topK: limits.topK,
    maxTokens: limits.maxTokensPerRequest,
    timeoutMs: limits.timeoutMs,
    extraBody: {
      chat_template_kwargs: { enable_thinking: limits.enableThinking },
    },
  });
  if (toolTrace.length > 0) {
    // Observability for the "did it look anything up?" question — names and
    // outcomes only, never the tool payloads (which can carry masked PHI).
    logger.info('clinical_chat_tools_used', {
      mode: toolContext.mode,
      tools: toolTrace.map((t) => `${t.name}:${t.ok ? 'ok' : 'fail'}${t.cached ? ':cached' : ''}`),
    });
  }

  // Persist the turn pair (masked transcript only) so context stays bounded.
  // Store the QUESTION, not `userTurn` — userTurn carries the freshly rendered
  // context block, and replaying up to 10 stale province snapshots per request
  // both burned the token budget and let the model answer from an old census.
  // The live block is rebuilt every turn above, so history never needs it.
  if (scope) {
    await appendChatTurn(scope, { role: 'user', content: question });
    await appendChatTurn(scope, { role: 'assistant', content: answer });
  }
  return { answer };
}
