// Phase 3 — clinical-chat multi-turn session memory (Redis, TTL-bounded).
//
// Stores ONLY the PDPA-safe prompt transcript (masked by context-builder +
// prompt-config — never raw patient PHI) keyed per user with a TTL, and caps
// history so a long session cannot grow the context window unbounded (cost:
// every stored turn is re-sent to GLM-5.2 each request).
import { createHash } from 'crypto';
import { cacheGetJson, cacheSetJson } from '@/lib/cache';
import type { LlmChatMessage } from '@/lib/llm-client';
import type { ClinicalChatMode } from './prompt-config';

const KEY_PREFIX = 'kk-lrms:chat';
const MAX_HISTORY_TURNS = 20;
const SESSION_TTL_SECONDS = 60 * 60; // 1h idle expiry

export type ChatMemoryTurn = Pick<LlmChatMessage, 'role' | 'content'>;

/**
 * Memory bucket identity. Scoping by mode + hospital keeps a ward (per-patient)
 * conversation from bleeding into a dashboard (statistics) one — they have
 * different system prompts and different context blocks, so a shared transcript
 * actively degrades both.
 */
export interface ChatMemoryScope {
  /** Session user id. HASHED into the key — /api/chat falls back to
   *  session.user.userCid, and a national ID must never sit in a Redis key. */
  userId: string;
  mode: ClinicalChatMode;
  /** Session hcode; absent for provincial/central users (province bucket). */
  hospitalCode?: string;
}

interface MemoryEnvelope {
  messages: ChatMemoryTurn[];
}

function sessionKey(scope: ChatMemoryScope): string {
  const user = createHash('sha256').update(scope.userId).digest('hex').slice(0, 16);
  const hospital = scope.hospitalCode || 'province';
  return `${KEY_PREFIX}:mem:${scope.mode}:${hospital}:${user}`;
}

/** Read the bucket's bounded chat history (empty array when none / expired). */
export async function getChatHistory(scope: ChatMemoryScope): Promise<ChatMemoryTurn[]> {
  const envelope = await cacheGetJson<MemoryEnvelope>(sessionKey(scope));
  return envelope?.messages ?? [];
}

/**
 * Wipe a bucket's transcript ("เริ่มบทสนทนาใหม่").
 *
 * Clearing the panel client-side is NOT enough: the transcript lives in Redis
 * and would keep being replayed into every later turn, so the bot would still
 * "remember" a conversation the user believes they ended. Written as an empty
 * envelope rather than a delete so the cache layer needs no extra verb.
 */
export async function clearChatHistory(scope: ChatMemoryScope): Promise<void> {
  await cacheSetJson(sessionKey(scope), { messages: [] } satisfies MemoryEnvelope, 1);
}

/** Append a turn and persist the bounded history with a TTL. */
export async function appendChatTurn(
  scope: ChatMemoryScope,
  turn: ChatMemoryTurn,
): Promise<ChatMemoryTurn[]> {
  const current = await getChatHistory(scope);
  const next = [...current, turn].slice(-MAX_HISTORY_TURNS);
  await cacheSetJson(
    sessionKey(scope),
    { messages: next } satisfies MemoryEnvelope,
    SESSION_TTL_SECONDS,
  );
  return next;
}
