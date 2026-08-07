// Chat tool registry + the single execution chokepoint.
//
// SCOPE POLICY (2026-08-06 safety review): the starting surface is
// AGGREGATE-ONLY plus the one already-scoped, already-masked patient lookup.
// Deliberately NOT exposed yet:
//   - getHighRiskPatients / getHospitalPatientList — both decrypt names and
//     getHighRiskPatients takes no hospital argument at all, so a scope gate
//     here could not constrain it. Give those an hcode parameter and an
//     allow-list projection first.
// Every tool wraps an EXISTING service (constitution IV: no new business logic,
// no parallel SQL), so a tool answer and the dashboard can never disagree.
//
// Every failure path returns a tool MESSAGE, never a throw: a refusal the model
// can read ("ไม่มีสิทธิ์ดูข้อมูลรายผู้ป่วยในโหมดสถิติ") makes it self-correct on
// the next round, whereas an exception ends the turn in a 502.
import type { DatabaseAdapter } from '@/db/adapter';
import type { ChatCompletionTool } from '@/lib/llm-client';
import type { ToolExecutionResult } from './agent-loop';
import type { ClinicalChatMode } from './prompt-config';
import {
  getStageKPIs,
  getProvinceDashboard,
  getTrends,
  getDashboardAlerts,
} from '@/services/dashboard';
import { formatBangkokStamp } from '@/lib/bangkok-time';
import { executeToolCall } from './tool-router';
import { getPatientContextTool } from './tools';
import { chatToolSurface, chatToolBudget } from '@/config/clinical-chat-tools';
import { knowledgeCollections } from '@/config/knowledge-config';
import { findPlaybook, playbookIds } from '@/config/chat-playbooks';
import { askKnowledgeLlmAnswer } from './knowledge-client';

export interface ChatToolContext {
  db: DatabaseAdapter;
  /** Session hcode. Absent for provincial/central users. */
  hospitalCode?: string;
  mode: ClinicalChatMode;
  /** BMS session id from the browser — the bearer token for the hosted
   *  knowledge base. Absent for non-BMS logins, which simply cannot use
   *  ask_medical_ebook (it refuses in-band rather than failing the turn). */
  bmsSessionId?: string | null;
  /** Per-turn call budget, mutated in place by runChatTool. */
  budget: Map<string, number>;
  /** Names of tools that returned real data this turn — the grounding ledger
   *  (a number in the answer is only trustworthy if something fetched it). */
  ledger: string[];
}

interface ChatToolSpec {
  tool: ChatCompletionTool;
  /** 'hospital' tools refuse when the session has no hcode. */
  scope: 'hospital' | 'province';
  execute: (ctx: ChatToolContext, args: Record<string, unknown>) => Promise<unknown>;
}

/** A refusal the MODEL should see and react to — distinct from a crash. */
class ToolRefusal extends Error {}

const REGISTRY: Record<string, ChatToolSpec> = {
  get_stage_kpis: {
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'get_stage_kpis',
        description:
          'จำนวนผู้ป่วยรวมทั้งจังหวัดแยกตามระยะการดูแล: ANC ที่กำลังติดตาม, ผู้ที่รอคลอด/อยู่ในห้องคลอดขณะนี้ และผู้ที่คลอดแล้วในเดือนนี้ พร้อมแยกระดับความเสี่ยง — **ใช้เมื่อ** ถูกถามว่า "ตอนนี้มีคนรอคลอดกี่คน" "ANC กี่ราย" "เดือนนี้คลอดไปกี่ราย"',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    execute: async (ctx) => getStageKPIs(ctx.db),
  },
  get_province_overview: {
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'get_province_overview',
        description:
          'ยอดรวมทั้งจังหวัดและจำนวนผู้รอคลอดแยกรายโรงพยาบาล พร้อมสถานะการเชื่อมต่อของแต่ละ รพ. — **ใช้เมื่อ** ถูกถามว่าโรงพยาบาลไหนมีผู้ป่วยมากที่สุด/เปรียบเทียบระหว่าง รพ. **อย่าใช้เมื่อ** ต้องการแค่ยอดรวม (ใช้ get_stage_kpis)',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    execute: async (ctx) => {
      const dash = await getProvinceDashboard(ctx.db);
      // Projection: counts + connection only. Keeps the payload small and free
      // of anything that isn't already on the dashboard.
      return {
        summary: dash.summary,
        updatedAt: dash.updatedAt,
        hospitals: dash.hospitals
          .filter((h) => h.counts.total > 0)
          .sort((a, b) => b.counts.total - a.counts.total)
          .map((h) => ({
            hcode: h.hcode,
            name: h.name,
            inLabor: h.counts.total,
            high: h.counts.high,
            medium: h.counts.medium,
            low: h.counts.low,
            ancTotal: h.ancCounts.total,
            connectionStatus: h.connectionStatus,
          })),
      };
    },
  },
  get_trends: {
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'get_trends',
        description:
          'แนวโน้มย้อนหลัง: การรับเข้าห้องคลอดรายชั่วโมงใน 24 ชม. และสถิติรายวันย้อนหลัง — **ใช้เมื่อ** ถูกถามถึงแนวโน้ม/เทียบกับเมื่อวาน/ช่วงที่ผ่านมา',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    execute: async (ctx) => getTrends(ctx.db),
  },
  get_alerts: {
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'get_alerts',
        description:
          'รายการงานค้างที่ต้องจัดการ: ส่งต่อเกิน SLA, ANC ที่ขาดการติดตาม, เคสเสี่ยงสูงที่ต้องเฝ้าระวัง — **ใช้เมื่อ** ถูกถามว่า "มีอะไรต้องรีบจัดการบ้าง"',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    execute: async (ctx) => getDashboardAlerts(ctx.db),
  },
  get_current_datetime: {
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'get_current_datetime',
        description:
          'วันและเวลาปัจจุบันตามเวลาไทย (พ.ศ.) — **ใช้เสมอ** ก่อนตอบคำถามที่อ้างถึง "วันนี้" "เดือนนี้" "เมื่อวาน" ห้ามเดาวันที่เอง',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    execute: async () => {
      const now = new Date();
      return { iso: now.toISOString(), thai: formatBangkokStamp(now), timezone: 'Asia/Bangkok' };
    },
  },
  load_playbook: {
    // Instructions, not data — no DB, no hospital scope, no PHI.
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'load_playbook',
        description:
          'โหลดคู่มือการทำงานเฉพาะของระบบ KK-LRMS (เกณฑ์ CPD, การอ่าน partograph, ระดับ ANC, SLA การส่งต่อ, กฎการรายงานสถิติ) — **ใช้ก่อนตอบ** เมื่อคำถามเกี่ยวกับหัวข้อเหล่านี้ เพราะเป็นกติกาเฉพาะของระบบนี้ที่เดาเองไม่ได้ **อย่าใช้เมื่อ** ถามความรู้ทางการแพทย์ทั่วไป (ใช้ ask_medical_ebook)',
        parameters: {
          type: 'object',
          properties: {
            id: { type: 'string', enum: playbookIds(), description: 'รหัสคู่มือจากรายการที่ให้ไว้' },
          },
          required: ['id'],
          additionalProperties: false,
        },
      },
    },
    execute: async (_ctx, args) => {
      const id = typeof args.id === 'string' ? args.id.trim() : '';
      const playbook = findPlaybook(id);
      if (!playbook) {
        // Naming the valid ids turns a hallucinated id into a self-correction
        // on the next round instead of a dead end.
        throw new ToolRefusal(`ไม่มีคู่มือรหัส "${id}" — ที่มีคือ: ${playbookIds().join(', ')}`);
      }
      return { id: playbook.id, instructions: playbook.body };
    },
  },
  ask_medical_ebook: {
    // Reference lookup, not patient data — province scope, no hcode needed.
    scope: 'province',
    tool: {
      type: 'function',
      function: {
        name: 'ask_medical_ebook',
        description:
          'ค้นตำราแพทย์/คู่มือยาจากคลังความรู้จริง (ebook-medical, drug-monograph) แล้วได้คำตอบพร้อมอ้างอิง — **ใช้เสมอ** ก่อนตอบคำถามเชิงวิชาการ/แนวทางรักษา/ขนาดยา/ภาวะแทรกซ้อน เช่น "PPH รักษายังไง" "magnesium sulfate ขนาดเท่าไร" ห้ามตอบจากความจำของโมเดลเอง **อย่าใช้เมื่อ** ถามจำนวน/สถิติผู้ป่วยในระบบ (ใช้เครื่องมือสถิติ) — และห้ามใส่ชื่อหรือเลขบัตรผู้ป่วยลงในคำถาม',
        parameters: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'คำถามเชิงวิชาการ (ไม่มีข้อมูลระบุตัวผู้ป่วย)',
            },
            collection: {
              type: 'string',
              enum: knowledgeCollections(),
              description: "'ebook-medical' = ตำราแพทย์ · 'drug-monograph' = ข้อมูลยา",
            },
          },
          required: ['question'],
          additionalProperties: false,
        },
      },
    },
    execute: async (ctx, args) => {
      const question = typeof args.question === 'string' ? args.question.trim() : '';
      if (!question) throw new ToolRefusal('ต้องระบุคำถามที่จะค้นในตำราแพทย์');
      const requested = typeof args.collection === 'string' ? args.collection : '';
      const collection = knowledgeCollections().includes(requested)
        ? requested
        : knowledgeCollections()[0];
      try {
        const res = await askKnowledgeLlmAnswer(question, {
          sessionId: ctx.bmsSessionId,
          collection,
        });
        if (!res.answer.trim()) {
          throw new ToolRefusal('ไม่พบเนื้อหาที่เกี่ยวข้องในคลังความรู้');
        }
        return {
          source: 'medical-knowledge-base',
          collection: res.answer ? res.collection : collection,
          question,
          answer: res.answer,
          cached: res.cached ?? false,
          note: 'เนื้อหานี้มาจากตำราแพทย์/คู่มือยา ให้เรียบเรียงเป็นภาษาไทยและอ้างอิงว่ามาจากคลังความรู้ ไม่ใช่ข้อมูลผู้ป่วยรายบุคคล',
        };
      } catch (error) {
        // A knowledge outage must not kill the turn — the model is told the
        // reference is unavailable so it can answer cautiously and say so.
        if (error instanceof ToolRefusal) throw error;
        throw new ToolRefusal(
          `ค้นคลังความรู้ไม่สำเร็จ: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  },
  [getPatientContextTool.function.name]: {
    scope: 'hospital',
    tool: getPatientContextTool,
    execute: async (ctx, args) => {
      // Already scope-enforced and PDPA-masked (tool-router + context-builder).
      const res = await executeToolCall(
        ctx.db,
        ctx.hospitalCode ?? '',
        'get_patient_context',
        args,
      );
      if (!res.ok) throw new ToolRefusal(res.message ?? 'ไม่พบข้อมูลผู้ป่วย');
      return res.patient;
    },
  },
};

/** Tool declarations offered for a mode (config-driven, never hardcoded). */
export function chatToolsForMode(mode: ClinicalChatMode): ChatCompletionTool[] {
  return chatToolSurface(mode)
    .map((name) => REGISTRY[name]?.tool)
    .filter((t): t is ChatCompletionTool => Boolean(t));
}

/**
 * The single door every model-requested tool call goes through: unknown-name →
 * mode-surface → budget → scope → execute → ledger. Always resolves.
 */
export async function runChatTool(
  ctx: ChatToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const spec = REGISTRY[name];
  if (!spec) {
    return refuse(`ไม่รู้จักเครื่องมือ "${name}"`, 'unknown_tool');
  }
  if (!chatToolSurface(ctx.mode).includes(name)) {
    return refuse(`เครื่องมือ "${name}" ใช้ไม่ได้ในโหมดนี้`, 'not_in_mode');
  }
  const used = ctx.budget.get(name) ?? 0;
  const allowed = chatToolBudget(name);
  if (used >= allowed) {
    return refuse(
      `เรียก "${name}" ครบจำนวนที่อนุญาตแล้ว (${allowed} ครั้ง) — ให้สรุปจากข้อมูลที่มี`,
      'budget_exhausted',
    );
  }
  ctx.budget.set(name, used + 1);

  if (spec.scope === 'hospital' && !ctx.hospitalCode) {
    return refuse(
      'บัญชีนี้ไม่ได้ผูกกับโรงพยาบาลใด จึงดูข้อมูลรายผู้ป่วยไม่ได้ — ใช้เครื่องมือสถิติรวมแทน',
      'no_hospital_scope',
    );
  }

  try {
    const data = await spec.execute(ctx, args);
    ctx.ledger.push(name);
    return { ok: true, content: JSON.stringify(data) };
  } catch (error) {
    if (error instanceof ToolRefusal) {
      return refuse(error.message, 'not_found');
    }
    throw error; // genuine failure — the loop converts it to an in-band error
  }
}

function refuse(message: string, reason: string): ToolExecutionResult {
  return { ok: false, content: JSON.stringify({ error: message, reason }) };
}
