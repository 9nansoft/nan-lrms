// scripts/codemods/design-tokens.mjs
// One-shot codemod: node --experimental-strip-types scripts/codemods/design-tokens.mjs [--write]
// Dry-run by default; prints totals and every manual-review site.
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { rewriteSource } from './design-tokens-map.ts';

const write = process.argv.includes('--write');
const EXCLUDE = [/Kiosk/i, /^src\/components\/ui\//];
const files = execSync("git ls-files 'src/*.ts' 'src/*.tsx' 'src/**/*.ts' 'src/**/*.tsx'", { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((r) => r.test(f)));

let changed = 0;
let sizes = 0;
let colors = 0;
const manual = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const r = rewriteSource(src);
  sizes += r.sizeCount;
  colors += r.colorCount;
  for (const m of r.manual) manual.push(`${f}: ${m}`);
  if (r.output !== src) {
    changed += 1;
    if (write) writeFileSync(f, r.output);
  }
}
console.log(`[design-tokens] ${write ? 'WROTE' : 'DRY RUN'} files=${changed} sizes=${sizes} colors=${colors} manual=${manual.length}`);
for (const m of manual) console.log(`  manual: ${m}`);
