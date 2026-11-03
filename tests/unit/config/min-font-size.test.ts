// Guards the 13px Thai legibility floor against inline-style sizes, which the
// className codemod (Task 14) cannot see. Kiosk-only files are exempt.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { MIN_TEXT_PX } from '@/config/design-tokens';

const files = execSync("git ls-files 'src/**/*.tsx' 'src/**/*.ts'", { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !/Kiosk/i.test(f));

// fontSize: 10 | fontSize: '11px' | font-size: 12px (inside HTML strings)
const NUMERIC = /fontSize\s*[:=]\s*\{?\s*['"]?(\d+(?:\.\d+)?)(?:px)?['"]?/g;
const CSS_STRING = /font-size:\s*(\d+(?:\.\d+)?)px/g;
// Kiosk arms (A) are never matched by NUMERIC (it needs a digit right after
// `fontSize:`), so only the non-kiosk arm (B) is checked, explicitly, below.
const KIOSK_TERNARY = /isKiosk\s*\?\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/g;

describe('13px floor — inline font sizes outside kiosk', () => {
  it('no inline font size under MIN_TEXT_PX', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      for (const re of [NUMERIC, CSS_STRING]) {
        for (const m of src.matchAll(re)) {
          const px = Number(m[1]);
          if (px < MIN_TEXT_PX) {
            const line = src.slice(0, m.index).split('\n').length;
            offenders.push(`${f}:${line} ${m[0]}`);
          }
        }
      }
      for (const m of src.matchAll(KIOSK_TERNARY)) {
        if (Number(m[2]) < MIN_TEXT_PX) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${f}:${line} non-kiosk arm ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
