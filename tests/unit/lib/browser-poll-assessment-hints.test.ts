// The browser's assessment "hints" — the cheap "is there anything new?"
// question. HOSxP primary keys reach 18 digits, beyond Number's safe
// integer range, so the comparison must happen on the digits (BigInt), not
// on floats: two 18-digit keys can compare equal as Numbers while the form
// actually has a newer row.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pullAssessmentHints } from '@/lib/browser-poll';
import type { ConnectionConfig } from '@/types/bms-browser';

const config: ConnectionConfig = {
  apiUrl: 'https://t.example/api',
  bearerToken: 'eyJ-test',
  appIdentifier: 'NN-LRMS.Web',
};

/** A /api/sql answer carrying one max_pk per form table, keyed by table name. */
function sqlMock(maxPkByTable: Record<string, string | null>): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { sql: string };
    const table = /FROM (\w+)/.exec(body.sql)?.[1] ?? '';
    const max = maxPkByTable[table] ?? null;
    return new Response(JSON.stringify({ MessageCode: 200, data: [{ max_pk: max }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
}

const OPTS = { config } as Parameters<typeof pullAssessmentHints>[0];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('pullAssessmentHints', () => {
  it('raises a flag when the form has a key above the server cursor', async () => {
    vi.stubGlobal(
      'fetch',
      sqlMock({ asm_first_pregnant_pt_nan: '9007199254740993' }),
    );

    const hints = await pullAssessmentHints(OPTS, {
      asm_first_pregnant_pt_nan: '9007199254740992',
      asm_lr_record_birth_period_nan: '500',
      asm_lr_record_after_birth_nan: '500',
    });

    // 9007199254740993 and ...992 collide as Numbers — only a digit
    // comparison sees the new row.
    expect(hints).not.toBeNull();
    expect(hints!['asm_first_pregnant_pt_nan']).toBeGreaterThan(0);
  });

  it('stays quiet when the cursor already covers the newest key', async () => {
    vi.stubGlobal(
      'fetch',
      sqlMock({
        asm_first_pregnant_pt_nan: '500',
        asm_lr_record_birth_period_nan: '500',
        asm_lr_record_after_birth_nan: '500',
      }),
    );

    const hints = await pullAssessmentHints(OPTS, {
      asm_first_pregnant_pt_nan: '500',
      asm_lr_record_birth_period_nan: '500',
      asm_lr_record_after_birth_nan: '500',
    });

    expect(hints).toBeNull();
  });
});
