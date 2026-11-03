// tests/unit/config/presence.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ONLINE_USERS_POLL_MS, PRESENCE_TTL_SECONDS } from '@/config/presence';

describe('presence config', () => {
  it('values match what the server enforces and the tab quotes', () => {
    expect(PRESENCE_TTL_SECONDS).toBe(120);
    expect(ONLINE_USERS_POLL_MS).toBe(10_000);
  });
  it('src/lib/presence.ts imports the TTL instead of redeclaring it', () => {
    const src = readFileSync('src/lib/presence.ts', 'utf8');
    expect(src).not.toMatch(/const PRESENCE_TTL_SECONDS\s*=/);
    expect(src).toMatch(/from '@\/config\/presence'/);
  });
});
