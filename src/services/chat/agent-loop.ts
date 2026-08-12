// Bounded tool-calling agent loop — the chatbot's "think, look it up, answer"
// cycle (2026-08-06 intelligence upgrade, ported from the bms-ai-chatbot-demo
// orchestrator's round-budget design).
//
// Why a loop at all: a single static context block can only answer questions
// somebody predicted. With tools the model fetches what a given question
// actually needs — and, crucially, it fetches REAL numbers instead of inventing
// plausible ones.
//
// Invariants (each pinned by a test):
//   - the final round offers NO tools and sets tool_choice:'none', so the turn
//     always terminates in prose rather than another lookup;
//   - an identical repeated call is served from this turn's cache — small models
//     re-ask the same question forever otherwise;
//   - malformed tool arguments are dropped before they reach the wire (a
//     truncated arguments string 400s the whole conversation);
//   - a failing tool becomes an in-band error the model can react to, never an
//     exception that turns into a 502 for the nurse.
import { llmChatRaw, type ChatCompletionTool, type LlmChatMessage } from '@/lib/llm-client';
import { logger } from '@/lib/logger';

export interface ToolExecutionResult {
  ok: boolean;
  /** JSON (or text) handed back to the model as the tool message content. */
  content: string;
}

export interface ToolTraceEntry {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** True when this call was answered from the per-turn cache. */
  cached?: boolean;
  content: string;
}

export interface RunChatTurnOptions {
  messages: LlmChatMessage[];
  tools: ChatCompletionTool[];
  executeTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolExecutionResult> | ToolExecutionResult;
  /** Total completions allowed, including the forced final answer. */
  maxRounds: number;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  timeoutMs?: number;
  extraBody?: Record<string, unknown>;
}

export interface ChatTurnResult {
  answer: string;
  toolTrace: ToolTraceEntry[];
  rounds: number;
}

/** Thai nudge for the forced final round. tool_choice:'none' alone tends to
 *  produce "next I will call…" narration instead of an answer. */
const FINAL_ROUND_NUDGE =
  'สรุปคำตอบจากข้อมูลที่ได้มาแล้วเท่านั้น ห้ามเรียกเครื่องมือเพิ่ม ' +
  'ถ้าข้อมูลที่มีไม่พอ ให้บอกตรง ๆ ว่ายังไม่มีข้อมูลส่วนไหน';

const DUPLICATE_NOTICE =
  'เรียกเครื่องมือนี้ด้วยพารามิเตอร์เดิมไปแล้ว — ใช้ผลลัพธ์เดิมและสรุปเป็นคำตอบ';

/** Stable signature so {a:1,b:2} and {b:2,a:1} are one call. */
function callSignature(name: string, args: Record<string, unknown>): string {
  const sorted = Object.keys(args)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = args[k];
      return acc;
    }, {});
  return `${name}::${JSON.stringify(sorted)}`;
}

export async function runChatTurn(opts: RunChatTurnOptions): Promise<ChatTurnResult> {
  const messages: LlmChatMessage[] = [...opts.messages];
  const toolTrace: ToolTraceEntry[] = [];
  const cache = new Map<string, ToolExecutionResult>();
  const maxRounds = Math.max(1, opts.maxRounds);
  let rounds = 0;

  const sampling = {
    model: opts.model,
    baseUrl: opts.baseUrl,
    temperature: opts.temperature,
    topP: opts.topP,
    topK: opts.topK,
    maxTokens: opts.maxTokens,
    timeoutMs: opts.timeoutMs,
    extraBody: opts.extraBody,
  };

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;
    const isFinalRound = round === maxRounds - 1;
    // Final round: withhold the tools entirely AND say so, so the model has no
    // option but to answer from what it already fetched.
    const turnMessages = isFinalRound
      ? [...messages, { role: 'system' as const, content: FINAL_ROUND_NUDGE }]
      : messages;

    const reply = await llmChatRaw({
      ...sampling,
      messages: turnMessages,
      ...(isFinalRound
        ? { toolChoice: 'none' as const }
        : { tools: opts.tools, toolChoice: 'auto' as const }),
    });

    if (!reply.toolCalls.length) {
      if (reply.content) {
        return { answer: reply.content, toolTrace, rounds };
      }
      // Empty text and no calls: nothing to feed back, so re-asking with the
      // same messages would just repeat. Break to the synthesis pass.
      break;
    }

    // Replay the assistant turn verbatim — a tool message whose matching
    // assistant turn is missing is rejected as orphaned.
    messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.toolCalls });

    for (const call of reply.toolCalls) {
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
      } catch {
        // sanitizeToolCalls already dropped unparseable calls; belt and braces.
        args = {};
      }
      const signature = callSignature(name, args);
      const cached = cache.get(signature);
      if (cached) {
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: `${DUPLICATE_NOTICE}\n${cached.content}`,
        });
        toolTrace.push({ name, args, ok: cached.ok, cached: true, content: cached.content });
        continue;
      }

      let result: ToolExecutionResult;
      try {
        result = await opts.executeTool(name, args);
      } catch (error) {
        // A tool failure is DATA for the model ("ยังดึงข้อมูลไม่ได้"), not a
        // turn-ending exception. It can then answer honestly or try elsewhere.
        const message = error instanceof Error ? error.message : String(error);
        logger.warn('chat_tool_failed', { tool: name, error: message });
        result = {
          ok: false,
          content: JSON.stringify({ error: 'tool_failed', tool: name, detail: message }),
        };
      }
      cache.set(signature, result);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
      toolTrace.push({ name, args, ok: result.ok, content: result.content });
    }
  }

  // The loop ended without prose but with tool results in hand — one forced
  // synthesis pass so the work already paid for turns into an answer.
  const synthesis = await llmChatRaw({
    ...sampling,
    messages: [...messages, { role: 'system', content: FINAL_ROUND_NUDGE }],
    toolChoice: 'none',
  });
  rounds += 1;
  return {
    answer: synthesis.content ?? 'ยังสรุปคำตอบไม่ได้ ลองถามใหม่อีกครั้ง',
    toolTrace,
    rounds,
  };
}
