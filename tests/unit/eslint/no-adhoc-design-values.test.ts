import { describe, it, expect } from 'vitest';
import { RuleTester } from 'eslint';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import rule from '../../../eslint-rules/no-adhoc-design-values.mjs';

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe('no-adhoc-design-values', () => {
  // RuleTester registers its own describe/it blocks, so it must run at
  // describe level — calling it inside it() fails under Vitest.
  tester.run('no-adhoc-design-values', rule, {
      valid: [
        { code: '<div className="text-caption bg-danger-tint text-slate-500" />' },
        { code: 'cn("text-label", ok && "bg-ok")' },
        { code: '<div style={{ color: COLOR.riskHigh }} />' },
        { code: 'const id = "#section";' }, // not in className/style
      ],
      invalid: [
        { code: '<div className="text-[11px]" />', errors: [{ messageId: 'size' }] },
        { code: '<div className="hover:bg-red-50" />', errors: [{ messageId: 'palette' }] },
        { code: 'cn("p-2", "text-emerald-700")', errors: [{ messageId: 'palette' }] },
        { code: '<div className={`x ${a} bg-[#ff0000]`} />', errors: [{ messageId: 'hex' }] },
        { code: '<div style={{ color: "#22c55e" }} />', errors: [{ messageId: 'hex' }] },
      ],
  });

  it('allowlist entries all carry a reason and never exceed maxEntries', () => {
    const list = JSON.parse(
      readFileSync(path.resolve(__dirname, '../../../eslint-rules/design-allowlist.json'), 'utf8'),
    ) as { maxEntries: number; files: Record<string, string> };
    const entries = Object.entries(list.files);
    expect(entries.length).toBeLessThanOrEqual(list.maxEntries);
    for (const [file, reason] of entries) {
      expect(reason.trim().length, `reason for ${file}`).toBeGreaterThan(10);
    }
  });
});
