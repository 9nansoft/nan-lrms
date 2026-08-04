// Clinical-chatbot service — the single place that talks to GLM-5.2 for the
// chat feature (business logic lives in services, never in route handlers:
// constitution IV). Phase 0 = thin non-streaming chat. Phase 1+ will add
// context builder + redactor + memory here without changing the route shape.
import { llmChat } from '@/lib/llm-client';
import {
  clinicalChatBaseUrl,
  clinicalChatModel,
  clinicalChatLimits,
} from '@/config/clinical-chat-config';

export interface ChatReply {
  answer: string;
}

/**
 * Sends a single-turn Thai clinical question to GLM-5.2 with thinking DISABLED
 * (extra_body.chat_template_kwargs.enable_thinking=false — SGLang GLM-5.2 is a
 * reasoning model and billed reasoning tokens can eat the entire max_tokens
 * budget before a visible answer appears) and a hard max_tokens cap (cost
 * lever #1). The endpoint/model/limits come from config, never literals.
 */
export async function askClinicalQuestion(question: string): Promise<ChatReply> {
  const limits = clinicalChatLimits();
  const answer = await llmChat({
    model: clinicalChatModel(),
    baseUrl: clinicalChatBaseUrl(),
    messages: [
      {
        role: 'system',
        content:
          'คุณคือผู้ช่วยทางการแพทย์ด้านสูติกรรมของระบบ KK-LRMS ต่อคำถามของพยาบาล/แพทย์ ' +
          'ตอบเป็นภาษาไทย สั้น ตรงประเด็น ให้คำแนะนำที่ปลอดภัย และบอกเมื่อไม่แน่ใจ',
      },
      { role: 'user', content: question },
    ],
    temperature: 0.3,
    maxTokens: limits.maxTokensPerRequest,
    timeoutMs: limits.timeoutMs,
    extraBody: {
      chat_template_kwargs: { enable_thinking: false },
    },
  });
  return { answer };
}
