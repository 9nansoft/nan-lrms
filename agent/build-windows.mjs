// Build a standalone Windows executable for the agent.
//
//   node agent/build-windows.mjs
//
// Output: agent/dist/agent.exe — one file, no Node.js installation needed on
// the hospital's workstation. Built with esbuild (bundle → CommonJS) and
// pkg (embed a Node runtime).
//
// The hospital installs it as a Windows service with WinSW — see
// install/NN-LRMS-agent.xml and agent/README.md.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const dist = resolve(here, 'dist');
const cjs = resolve(dist, 'agent.cjs');

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  // pkg embeds a CommonJS script; esbuild's ESM output would need a loader.
  format: 'cjs',
  target: 'node20',
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
    resolve(dist, 'agent.exe'),
  ],
  { stdio: 'inherit', cwd: repoRoot },
);

console.log('[agent] built agent/dist/agent.exe');
