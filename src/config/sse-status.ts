// Live SSE health → what each dashboard mode shows. `stream` is the frozen
// kiosk footer text; `labelTh` + `tone` drive the normal-mode header chip.
import type { SseConnectionState } from '@/hooks/useSSE';

export interface SseStatusMeta {
  stream: string;
  labelTh: string;
  tone: 'ok' | 'neutral' | 'warn';
}

export const SSE_STATUS_META: Record<SseConnectionState, SseStatusMeta> = {
  connected: { stream: 'SSE · STREAM OK', labelTh: 'อัปเดตสด', tone: 'ok' },
  connecting: { stream: 'SSE · CONNECTING', labelTh: 'กำลังเชื่อมต่อข้อมูลสด…', tone: 'neutral' },
  reconnecting: {
    stream: 'SSE · RECONNECTING',
    labelTh: 'ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…',
    tone: 'warn',
  },
};
