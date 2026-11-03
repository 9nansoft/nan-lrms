import { describe, it, expect } from 'vitest';
import { SSE_STATUS_META } from '@/config/sse-status';

describe('SSE_STATUS_META', () => {
  it('keeps the kiosk stream strings byte-identical (kiosk is frozen)', () => {
    expect(SSE_STATUS_META.connected.stream).toBe('SSE · STREAM OK');
    expect(SSE_STATUS_META.connecting.stream).toBe('SSE · CONNECTING');
    expect(SSE_STATUS_META.reconnecting.stream).toBe('SSE · RECONNECTING');
  });
  it('gives normal mode a Thai label and a tone', () => {
    expect(SSE_STATUS_META.connected).toMatchObject({ labelTh: 'อัปเดตสด', tone: 'ok' });
    expect(SSE_STATUS_META.connecting.tone).toBe('neutral');
    expect(SSE_STATUS_META.reconnecting.tone).toBe('warn');
  });
});
