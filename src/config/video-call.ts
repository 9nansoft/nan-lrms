// Video-call client configuration — single source for the Jitsi domain so
// environments can point at a different instance without code changes.
export const JITSI_DOMAIN = process.env.NEXT_PUBLIC_JITSI_DOMAIN ?? 'jitsi1.hosxp.net';
