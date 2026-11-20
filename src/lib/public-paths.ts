// Edge-safe path allow-lists for src/middleware.ts, kept dependency-free so
// the auth-exemption decision can be unit tested without NextAuth.

// /deck is the MOPH executive briefing deck (no PHI, presentation assets only).
// Public so the briefing room laptop can open it directly via URL without
// requiring a BMS session.
export const PUBLIC_PATHS = [
  '/login',
  '/provider/complete',
  '/about',
  // Static user manual (public/manual.html) — no PHI; readable before login.
  '/manual.html',
  '/deck',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
  '/api/referrals/check',
  // The headless agent runs on the hospital's workstation with NO browser
  // session — it authenticates with a hospital-scoped API key. These paths
  // must stay outside the cookie-session gate (and outside the browser
  // Origin check) or the agent can never push. Same trust model as
  // /api/webhooks.
  '/api/sync/agent-push',
  '/api/sync/agent-heartbeat',
  '/api/sync/agent-authenticity',
];

// /illustrations is public decorative art (login hero, EmptyState images);
// it must load before sign-in, otherwise the middleware 307s it to /login.
export const STATIC_PATHS = ['/_next', '/favicon.ico', '/illustrations/'];

export const isStaticPath = (pathname: string): boolean =>
  STATIC_PATHS.some((p) => pathname.startsWith(p));

export const isPublicPath = (pathname: string): boolean =>
  PUBLIC_PATHS.some((p) => pathname.startsWith(p));

export const isAuthExempt = (pathname: string): boolean =>
  isStaticPath(pathname) || isPublicPath(pathname);
