// Server-side gate for the floating clinical-chat pill. The flag lives in
// clinicalChatEnabled() (CLINICAL_CHAT_ENABLED, server env), so the pill is
// decided here on the server — the same flag that makes /api/chat answer 503 —
// instead of rendering a pill whose every request would fail.
import { clinicalChatEnabled } from '@/config/clinical-chat-config';
import { ClinicalChatPanel } from '@/components/chat/ClinicalChatPanel';
import type { ClinicalChatMode } from '@/services/chat/prompt-config';

/** Collapsed pill is ~44px tall + 20px offset; pad the content so it never covers the last row. */
const CHAT_RESERVE = 'pb-20';

export function chatReserveClass(): string {
  return clinicalChatEnabled() ? CHAT_RESERVE : '';
}

export function ClinicalChatGate({ mode }: { mode: ClinicalChatMode }) {
  return clinicalChatEnabled() ? <ClinicalChatPanel mode={mode} /> : null;
}
