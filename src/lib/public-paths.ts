// Edge-safe path allow-lists for src/middleware.ts, kept dependency-free so
// the auth-exemption decision can be unit tested without NextAuth.

// /deck is the MOPH executive briefing deck (no PHI, presentation assets only).
// Public so the briefing room laptop can open it directly via URL without
// requiring a BMS session.
export const PUBLIC_PATHS = [
  '/login',
  '/provider/complete',
  '/about',
  '/deck',
  '/api/auth',
  '/api/health',
  '/api/webhooks',
  '/api/referrals/check',
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
