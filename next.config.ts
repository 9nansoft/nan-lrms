import type { NextConfig } from 'next';
import { execSync } from 'node:child_process';

const isDocker = process.env.DOCKER_BUILD === 'true';

// Resolve a short build identifier so the production UI can show "is the
// new build live?" at a glance. Order:
//   1. NEXT_PUBLIC_BUILD_ID env (CI / Docker can override explicitly)
//   2. short git SHA at build time
//   3. 'dev' fallback (no git, e.g. ephemeral container without .git)
let buildId = process.env.NEXT_PUBLIC_BUILD_ID;
if (!buildId) {
  try {
    buildId = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    buildId = 'dev';
  }
}
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? new Date().toISOString();

const nextConfig: NextConfig = {
  reactCompiler: true,
  // standalone output only for Docker builds; regular next start for bare server
  ...(isDocker && { output: 'standalone' as const }),
  serverExternalPackages: ['better-sqlite3', 'pg'],
  allowedDevOrigins: ['https://kk-lrms.bmscloud.in.th'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
};

export default nextConfig;
