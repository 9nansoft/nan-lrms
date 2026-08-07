// Which tools each chat mode may use, and how often per turn.
//
// Constitution I: no hardcoded conditions for LLM prompts. The surface is data,
// not an `if (mode === 'statistics')` buried in the loop — so a deployment can
// widen or narrow the bot's reach without a code change.
//
// Keeping the per-mode surface SMALL is a quality lever, not just a safety one:
// a 6-tool menu is chosen correctly far more often than a 15-tool menu.
import type { ClinicalChatMode } from '@/services/chat/prompt-config';
import { knowledgeSearchEnabled } from '@/config/knowledge-config';

/** Dashboard mode: province-wide aggregates only — no per-patient reach.
 *  ask_medical_ebook is included because an administrator still asks the
 *  occasional clinical question, and a referenced answer beats a remembered one. */
const STATISTICS_TOOLS = [
  'get_stage_kpis',
  'get_province_overview',
  'get_trends',
  'get_alerts',
  'get_current_datetime',
  'load_playbook',
  'ask_medical_ebook',
] as const;

/** Ward mode: the masked per-patient lookup, the medical reference lookup, and
 *  the aggregates a clinician asks about in passing ("แผนกเรามีกี่คนตอนนี้"). */
const CLINICAL_TOOLS = [
  'get_patient_context',
  'ask_medical_ebook',
  'get_stage_kpis',
  'get_alerts',
  'get_current_datetime',
  'load_playbook',
] as const;

function listEnv(key: string, fallback: readonly string[]): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return [...fallback];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function chatToolSurface(mode: ClinicalChatMode): string[] {
  const surface =
    mode === 'statistics'
      ? listEnv('CLINICAL_CHAT_TOOLS_STATISTICS', STATISTICS_TOOLS)
      : listEnv('CLINICAL_CHAT_TOOLS_CLINICAL', CLINICAL_TOOLS);
  // Killing the knowledge base removes the tool from the surface entirely, so
  // runChatTool's mode gate refuses it even if the model invents the name.
  return knowledgeSearchEnabled() ? surface : surface.filter((t) => t !== 'ask_medical_ebook');
}

/** Max executions of one tool per turn. Small models otherwise re-issue the
 *  same query until the round budget runs out and the turn dies with no answer.
 *  (The loop also caches identical calls; this bounds *varied* repeats.) */
export function chatToolBudget(_toolName: string): number {
  const raw = Number(process.env.CLINICAL_CHAT_TOOL_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : 2;
}
