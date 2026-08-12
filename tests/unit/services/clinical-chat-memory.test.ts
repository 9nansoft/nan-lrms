// Phase 3 TDD — clinical-chat session memory (plan 2026-08-03-clinical-chatbot-glm).
// Codex risk: "multi-turn memory expires and stores masked transcript only".
// Memory is stored in Redis via cache.ts with a TTL. Invariants:
//   1. The transcript is bounded (no unbounded growth into the context window).
//   2. What is stored is ONLY the PDPA-safe prompt transcript — never raw PHI.
//   3. (2026-08-06) The key is scoped by MODE + HOSPITAL, and never contains a
//      raw user identifier — route.ts falls back to session.user.userCid, i.e.
//      a national ID, which must not sit in a Redis key.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  appendChatTurn,
  getChatHistory,
  type ChatMemoryTurn,
  type ChatMemoryScope,
} from '@/services/chat/memory-store';

const KEY_PREFIX = 'nn-lrms:chat';

// vi.hoisted: the mock factory is hoisted above all top-level bindings, so the
// fake store must be created here and referenced from both the factory and the
// tests (project pattern — cfr. a776b5b vi.hoisted stabilization).
const HOISTED = vi.hoisted(() => {
  const data = new Map<string, string>();
  return {
    data,
    cacheGetJson: async <T>(key: string): Promise<T | null> => {
      const v = data.get(key);
      return v ? (JSON.parse(v) as T) : null;
    },
    cacheSetJson: async <T>(key: string, value: T, ttlSeconds: number): Promise<void> => {
      data.set(key, JSON.stringify(value));
      // TTL must always be a number — the store always requests expiry, never
      // an unbounded write.
      if (typeof ttlSeconds !== 'number') throw new Error('cacheSetJson TTL not a number');
    },
  };
});

vi.mock('@/lib/cache', () => ({
  cacheGetJson: HOISTED.cacheGetJson,
  cacheSetJson: HOISTED.cacheSetJson,
}));

const WARD: ChatMemoryScope = { userId: 'user-1', mode: 'clinical', hospitalCode: '10670' };
const DASH: ChatMemoryScope = { userId: 'user-1', mode: 'statistics', hospitalCode: '10670' };

describe('clinical-chat session memory — TTL + masked-persistence', () => {
  beforeEach(() => {
    HOISTED.data.clear();
  });

  it('stores only the masked turn transcript, keyed by session, with a TTL', async () => {
    const turn: ChatMemoryTurn = {
      role: 'user',
      content: 'ผู้ป่วย ชัยพร ส. (HN HN-1) อายุ 30 ปี · GA 28 สัปดาห์ — รีสก์สูงไหม?',
    };
    await appendChatTurn(WARD, turn);

    expect(HOISTED.data.size).toBe(1);
    const [key] = HOISTED.data.keys();
    expect(key).toContain(KEY_PREFIX);

    const history = await getChatHistory(WARD);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(turn);
  });

  it('grows bounded: appends up to a hard limit then drops the oldest turn', async () => {
    for (let i = 0; i < 40; i++) {
      await appendChatTurn(WARD, { role: 'user', content: `turn-${i}` });
    }
    const history = await getChatHistory(WARD);
    expect(history.length).toBeLessThanOrEqual(20); // MAX_HISTORY_TURNS
    expect(history.some((t) => t.content === 'turn-39')).toBe(true);
    expect(history.some((t) => t.content === 'turn-0')).toBe(false);
  });

  it('isolates the two modes: a ward conversation never bleeds into the dashboard', async () => {
    await appendChatTurn(WARD, { role: 'user', content: 'ward-question' });
    await appendChatTurn(DASH, { role: 'user', content: 'dashboard-question' });

    const ward = await getChatHistory(WARD);
    const dash = await getChatHistory(DASH);
    expect(ward.map((t) => t.content)).toEqual(['ward-question']);
    expect(dash.map((t) => t.content)).toEqual(['dashboard-question']);
    expect(HOISTED.data.size).toBe(2);
  });

  it('isolates hospitals: the same user at another hospital gets a fresh transcript', async () => {
    await appendChatTurn(WARD, { role: 'user', content: 'at-10670' });
    const other = await getChatHistory({ ...WARD, hospitalCode: '11002' });
    expect(other).toHaveLength(0);
  });

  it('never puts a raw user identifier (national ID) in the Redis key', async () => {
    const cid = '3320500282121';
    await appendChatTurn({ userId: cid, mode: 'statistics' }, { role: 'user', content: 'hi' });
    const [key] = HOISTED.data.keys();
    expect(key).not.toContain(cid);
    // …but the same user still resolves to the same bucket.
    const again = await getChatHistory({ userId: cid, mode: 'statistics' });
    expect(again).toHaveLength(1);
  });
});
