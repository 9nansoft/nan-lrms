import { describe, it, expect } from 'vitest';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';

describe('STATUS_TONE derived fields', () => {
  it('chip = border + tint + text, dot = solid, for every tone', () => {
    for (const t of Object.keys(STATUS_TONE) as StatusTone[]) {
      const s = STATUS_TONE[t];
      expect(s.chip).toBe(`${s.border} ${s.tint} ${s.text}`);
      expect(s.dot).toBe(s.solid);
    }
  });
});
