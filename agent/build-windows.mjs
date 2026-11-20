// Build the standalone Windows executable for the agent.
//
//   npm run build:agent:win
//
// Output: agent/dist/agent.exe — one self-contained file (Node runtime
// embedded, ~37 MB), no Node.js installation needed on the hospital's
// workstation. The packager (tools/package-agent.ts) puts it in the folder
// the hospital receives.
//
// The esbuild step produces a CommonJS bundle (pkg embeds a CJS script);
// the pull logic is the same module the browser uses — src/lib/browser-poll.ts
// — so the agent cannot drift from the browser.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const cjs = resolve(here, 'dist/agent.cjs');
const exe = resolve(here, 'dist/agent.exe');

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  outfile: cjs,
  alias: { '@': resolve(repoRoot, 'src') },
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

const pkgBin = resolve(repoRoot, 'node_modules/.bin/pkg');
if (!existsSync(pkgBin)) {
  console.error('[agent] pkg is not installed — run: npm i -D pkg');
  process.exit(1);
}

console.log('[agent] packaging agent.exe (windows x64)…');
execFileSync(
  pkgBin,
  [
    cjs,
    '--target',
    // pkg 5.8.1 ships prebuilt runtimes up to node18; the agent only needs
    // global fetch (Node 18+) and AbortSignal.timeout (Node 17.3+).
    'node18-win-x64',
    '--output',
    exe,
  ],
  { stdio: 'inherit', cwd: repoRoot },
);

console.log('[agent] built agent/dist/agent.exe');
