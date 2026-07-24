// Next.js instrumentation hook — runs once when the Node.js server starts.
// Triggers the full app initialization (DB connect, schema-sync, migrations,
// seeds, polling) BEFORE any user request arrives.  Without this, the first
// request that calls assertHospitalAccess() (e.g. the ProviderID credentials
// authorize callback) would hit a cold ensureInit() which can take 30-120 s on
// a slow DB, exceeding the reverse-proxy timeout and returning 502 to the
// client.
//
// Edge note: instrumentation.ts is also evaluated on the Edge runtime.  All
// Next.js DB / Node-only code is deferred behind the `nodejs` runtime guard
// below so the Edge bundle stays clean.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureInit } = await import('@/lib/ensure-init');
    // Fire-and-forget: we don't block Next.js startup, but we kick off init
    // immediately so it completes well before the first /api/auth request.
    ensureInit().catch((err: unknown) => {
      console.error('[instrumentation] initializeApp failed on startup:', err);
    });
  }
}
