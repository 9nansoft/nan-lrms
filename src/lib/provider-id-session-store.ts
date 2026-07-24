import { randomBytes } from 'crypto';
import type { ProviderPendingSession } from '@/lib/provider-id';
import { summarizeProviderOrgs } from '@/lib/provider-id';

const SESSION_TTL_MS = 5 * 60_000;

interface StoredProviderSession {
  data: ProviderPendingSession;
  expiresAt: number;
  flowId: string;
}

// Pin to `global` so the same Map is shared across all Next.js route bundles
// in a single Node.js process. Without this, the OAuth callback route bundle
// and the NextAuth [...nextauth] route bundle each get their own module
// instance — the session stored during the callback would be invisible to
// the `authorize()` call, causing spurious "token_not_found" rejections.
const _g = global as unknown as { __providerPendingSessions?: Map<string, StoredProviderSession> };
if (!_g.__providerPendingSessions) {
  _g.__providerPendingSessions = new Map<string, StoredProviderSession>();
}
const pendingSessions = _g.__providerPendingSessions;

function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [token, session] of pendingSessions.entries()) {
    if (session.expiresAt <= now) {
      pendingSessions.delete(token);
    }
  }
}

export function storeProviderPendingSession(
  data: ProviderPendingSession,
  flowId: string,
): string {
  cleanupExpiredSessions();
  const token = randomBytes(32).toString('base64url');
  pendingSessions.set(token, {
    data,
    flowId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

export function peekProviderPendingSession(
  token: string,
): { data: ProviderPendingSession; flowId: string } | null {
  cleanupExpiredSessions();
  const session = pendingSessions.get(token);
  if (!session) return null;
  return { data: session.data, flowId: session.flowId };
}

export type ConsumeProviderResult =
  | {
      ok: true;
      data: ProviderPendingSession;
      organizationIndex: number;
      flowId: string;
    }
  | { ok: false; reason: 'token_not_found' | 'index_out_of_range' };

export function consumeProviderPendingSession(
  token: string,
  organizationIndex: number,
): ConsumeProviderResult {
  cleanupExpiredSessions();
  const session = pendingSessions.get(token);
  if (!session) return { ok: false, reason: 'token_not_found' };
  if (
    !Number.isInteger(organizationIndex) ||
    organizationIndex < 0 ||
    organizationIndex >= session.data.organizations.length
  ) {
    return { ok: false, reason: 'index_out_of_range' };
  }
  pendingSessions.delete(token);
  return {
    ok: true,
    data: session.data,
    organizationIndex,
    flowId: session.flowId,
  };
}

export function getProviderPendingSummary(token: string) {
  const peek = peekProviderPendingSession(token);
  if (!peek) return null;
  return {
    flowId: peek.flowId,
    user: {
      nameTh: peek.data.user.name_th,
      titleTh: peek.data.user.title_th,
      providerId: peek.data.user.provider_id,
    },
    organizations: summarizeProviderOrgs(peek.data.organizations),
  };
}
