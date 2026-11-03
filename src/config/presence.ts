// src/config/presence.ts
// Client-safe presence constants (no server imports): src/lib/presence.ts
// enforces the TTL, the admin online-users tab quotes it.
export const PRESENCE_TTL_SECONDS = 120;
export const ONLINE_USERS_POLL_MS = 10_000;
