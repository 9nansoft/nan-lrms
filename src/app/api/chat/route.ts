// POST /api/chat — single-turn clinical-chatbot answer (Phase 0, non-stream).
//
// Cost-gated: when CLINICAL_CHAT_ENABLED is not "true" the route short-circuits
// 503 with a Thai message and NEVER calls the LLM — so a misconfigured deploy
// cannot silently burn GLM-5.2 compute. See
// docs/superpowers/plans/2026-08-03-clinical-chatbot-glm.md.
import { createHash } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { clinicalChatEnabled, clinicalChatRateLimit } from '@/config/clinical-chat-config';
import { askClinicalQuestion } from '@/services/chat/chat-service';
import { checkRateLimit } from '@/lib/rate-limit';
import { tryLogAccess } from '@/services/audit';
import { auditActorFromSession } from '@/lib/audit-actor';
import { maskCidsInText } from '@/lib/pii-mask';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  if (!clinicalChatEnabled()) {
    return NextResponse.json({ error: 'ปิดใช้งานผู้ช่วยแชททางคลินิก' }, { status: 503 });
  }
  let body: { message?: unknown; mode?: unknown };
  try {
    body = (await request.json()) as { message?: unknown; mode?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }
  // Mode: default 'clinical' (maternity ward). 'statistics' (dashboard) uses
  // aggregate context. Anything else is rejected — no silent misspelling.
  if (body.mode !== undefined && body.mode !== 'clinical' && body.mode !== 'statistics') {
    return NextResponse.json({ error: 'mode must be "clinical" or "statistics"' }, { status: 400 });
  }
  const hospitalCode =
    typeof session.user.hospitalCode === 'string' ? session.user.hospitalCode : undefined;
  const userId =
    typeof session.user.id === 'string'
      ? session.user.id
      : typeof session.user.userCid === 'string'
        ? session.user.userCid
        : undefined;
  const mode = body.mode === 'statistics' ? 'statistics' : 'clinical';

  // Rate limit BEFORE any LLM work. The bucket key is hashed because userId
  // falls back to session.user.userCid — a national ID must not reach Redis.
  const rateKey = createHash('sha256')
    .update(userId ?? 'anonymous')
    .digest('hex')
    .slice(0, 16);
  const rate = clinicalChatRateLimit();
  const verdict = await checkRateLimit(`chat:${rateKey}`, rate.limit, rate.windowSeconds);
  if (!verdict.allowed) {
    logger.warn('clinical_chat_rate_limited', { hospitalCode, mode });
    return NextResponse.json(
      {
        error: `ถามถี่เกินไป (สูงสุด ${rate.limit} คำถามต่อ ${rate.windowSeconds} วินาที) — รอสักครู่แล้วลองใหม่`,
      },
      { status: 429 },
    );
  }

  // Scrub embedded national IDs before the text leaves this process — it goes
  // to the inference server AND into the Redis transcript. maskCid alone is
  // anchored and would no-op here (see maskCidsInText).
  const question = maskCidsInText(message);

  try {
    await ensureInit();
    const db = await getDatabase();
    const { answer } = await askClinicalQuestion(question, {
      db,
      hospitalCode,
      userId,
      mode,
    });
    // PDPA trail: WHO asked, WHEN, in which scope — never the question text
    // (clinical detail) and never the answer.
    await tryLogAccess(db, {
      ...auditActorFromSession(session),
      action: 'CHAT_QUERY',
      resourceType: 'CHAT',
      resourceId: mode,
    });
    return NextResponse.json({ answer });
  } catch (error) {
    logger.error('clinical_chat_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: 'ผู้ช่วยแชทไม่พร้อมใช้งาน' }, { status: 502 });
  }
}
