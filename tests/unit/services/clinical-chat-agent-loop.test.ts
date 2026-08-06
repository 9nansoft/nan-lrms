// TDD — bounded tool-calling agent loop (2026-08-06 intelligence upgrade).
//
// The chatbot had tool DEFINITIONS and a tool ROUTER but no loop, so neither
// was ever reached from production code. Worse, the moment tools were sent the
// first tool-calling reply (content:null, finish_reason:'tool_calls') hit
// `throw new Error('LLM returned empty content')` in llm-client and the nurse
// got a 502. This pins the loop's contract:
//   1. a tool-call reply is executed and fed back as role:'tool'
//   2. the LAST round sends NO tools (the model must answer, not keep calling)
//   3. a repeated identical call is answered from cache, never re-executed
//   4. malformed tool arguments are dropped, never echoed into the next request
//   5. a tool that throws becomes an in-band error message, never a 502
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { runChatTurn } from '@/services/chat/agent-loop';
import type { ChatCompletionTool } from '@/lib/llm-client';

const TOOL: ChatCompletionTool = {
  type: 'function',
  function: { name: 'get_stage_kpis', description: 'ตัวเลขรวมทั้งจังหวัด', parameters: {} },
};

interface Scripted {
  content: string | null;
  toolCalls?: Array<{ id: string; name: string; args: string }>;
}

/** Stubs the OpenAI-compatible endpoint with a scripted sequence of replies. */
function stubLlm(script: Scripted[]) {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)) as Record<string, unknown>);
    const step = script.shift();
    if (!step) throw new Error('LLM called more times than scripted');
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: step.content,
              tool_calls: step.toolCalls?.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: c.args },
              })),
            },
            finish_reason: step.toolCalls?.length ? 'tool_calls' : 'stop',
          },
        ],
      }),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { bodies, fetchMock };
}

const BASE = {
  messages: [
    { role: 'system' as const, content: 'sys' },
    { role: 'user' as const, content: 'ถาม' },
  ],
  tools: [TOOL],
  maxRounds: 3,
};

describe('runChatTurn — bounded tool loop', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('executes a tool call and feeds the result back as a tool message', async () => {
    const { bodies } = stubLlm([
      { content: null, toolCalls: [{ id: 'c1', name: 'get_stage_kpis', args: '{}' }] },
      { content: 'ตอนนี้มีคนรอคลอด 9 คน' },
    ]);
    const executeTool = vi.fn(async () => ({ ok: true, content: '{"inLabor":9}' }));

    const result = await runChatTurn({ ...BASE, executeTool });

    expect(result.answer).toBe('ตอนนี้มีคนรอคลอด 9 คน');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(bodies).toHaveLength(2);
    const second = bodies[1].messages as Array<Record<string, unknown>>;
    const toolMsg = second.find((m) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg?.tool_call_id).toBe('c1');
    expect(toolMsg?.content).toContain('9');
    // The assistant turn carrying tool_calls must be replayed too, or the
    // server rejects the orphaned tool message.
    expect(second.some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls))).toBe(true);
    expect(result.toolTrace.map((t) => t.name)).toEqual(['get_stage_kpis']);
  });

  it('answers directly when the model calls no tool (single round)', async () => {
    const { bodies } = stubLlm([{ content: 'สวัสดีค่ะ' }]);
    const result = await runChatTurn({ ...BASE, executeTool: vi.fn() });
    expect(result.answer).toBe('สวัสดีค่ะ');
    expect(bodies).toHaveLength(1);
  });

  it('forces an answer on the final round: no tools offered, tool_choice none', async () => {
    const { bodies } = stubLlm([
      { content: null, toolCalls: [{ id: 'a', name: 'get_stage_kpis', args: '{}' }] },
      { content: null, toolCalls: [{ id: 'b', name: 'get_stage_kpis', args: '{"x":1}' }] },
      { content: 'สรุป: 9 คน' },
    ]);
    const executeTool = vi.fn(async () => ({ ok: true, content: '{}' }));

    const result = await runChatTurn({ ...BASE, maxRounds: 3, executeTool });

    expect(result.answer).toBe('สรุป: 9 คน');
    const last = bodies[bodies.length - 1];
    expect(last.tools).toBeUndefined();
    expect(last.tool_choice).toBe('none');
  });

  it('never re-executes an identical call — it replays the cached result', async () => {
    stubLlm([
      { content: null, toolCalls: [{ id: '1', name: 'get_stage_kpis', args: '{"a":1}' }] },
      { content: null, toolCalls: [{ id: '2', name: 'get_stage_kpis', args: '{"a":1}' }] },
      { content: 'ok' },
    ]);
    const executeTool = vi.fn(async () => ({ ok: true, content: '{"inLabor":9}' }));

    await runChatTurn({ ...BASE, maxRounds: 3, executeTool });

    expect(executeTool).toHaveBeenCalledTimes(1);
  });

  it('drops a tool call with malformed arguments instead of echoing it back', async () => {
    const { bodies } = stubLlm([
      { content: null, toolCalls: [{ id: 'bad', name: 'get_stage_kpis', args: '{"hn":"12' }] },
      { content: 'ขออภัย ขอข้อมูลอีกครั้ง' },
    ]);
    const executeTool = vi.fn(async () => ({ ok: true, content: '{}' }));

    const result = await runChatTurn({ ...BASE, executeTool });

    expect(executeTool).not.toHaveBeenCalled();
    expect(result.answer).toContain('ขออภัย');
    expect(JSON.stringify(bodies)).not.toContain('{"hn":"12');
  });

  it('turns a throwing tool into an in-band error message, never a rejection', async () => {
    stubLlm([
      { content: null, toolCalls: [{ id: 'x', name: 'get_stage_kpis', args: '{}' }] },
      { content: 'ยังดึงข้อมูลไม่ได้' },
    ]);
    const executeTool = vi.fn(async () => {
      throw new Error('db exploded');
    });

    const result = await runChatTurn({ ...BASE, executeTool });

    expect(result.answer).toBe('ยังดึงข้อมูลไม่ได้');
    expect(result.toolTrace[0].ok).toBe(false);
  });

  it('synthesizes an answer when the loop ends with tool results but no text', async () => {
    stubLlm([
      { content: null, toolCalls: [{ id: 'q', name: 'get_stage_kpis', args: '{}' }] },
      { content: null },
      { content: 'สรุปสุดท้าย' },
    ]);
    const executeTool = vi.fn(async () => ({ ok: true, content: '{"inLabor":9}' }));

    const result = await runChatTurn({ ...BASE, maxRounds: 2, executeTool });

    expect(result.answer).toBe('สรุปสุดท้าย');
  });
});
