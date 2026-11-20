// Build the agent into ONE file the hospital can drop on a workstation.
//
//   node agent/build.mjs
//
// Output: agent/dist/agent.mjs (Node 20+, no dependencies, no network install).
// The pull logic comes from src/lib/browser-poll.ts — the same module the
// browser tab uses — so the agent and the browser cannot drift apart.
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

await build({
  entryPoints: [resolve(here, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: resolve(here, 'dist/agent.mjs'),
  alias: { '@': resolve(repoRoot, 'src') },
  banner: { js: '#!/usr/bin/env node' },
  logLevel: 'info',
});

console.log('[agent] built agent/dist/agent.mjs');
