// Agent heartbeat — "is the headless agent on this hospital's workstation
// still alive and pulling?".
//
// The agent pushes data through /api/sync/agent-push, but a hospital with an
// empty ward (or an unchanged active set) legitimately skips the push. Without
// a heartbeat the server could not tell "agent is working, nothing to send"
// from "agent died an hour ago" — and the server-side backstop (which polls
// over the rate-limited tunnel) would have to poll every hospital.
//
// The heartbeat carries no patient data: version, transport mode, and the
// outcome of the last cycle.
type CacheModule = typeof import('@/lib/cache');

export interface AgentHeartbeat {
  /** ISO timestamp of the cycle that produced this heartbeat. */
  at: string;
  /** Agent build version, so an outdated install is visible in the admin UI. */
  version: string;
  /** Which transport the agent used to reach HOSxP ('unknown' when the
   * cycle failed before the transport was decided). */
  mode: 'local' | 'tunnel' | 'unknown';
  /** Did the cycle actually deliver data to the server? */
  pushed: boolean;
  /** PHI-free note — e.g. the error a failed cycle ended with. */
  detail?: string;
}

const HEARTBEAT_TTL_SEC = 24 * 60 * 60;
const key = (hospitalId: string) => `sync:agent:heartbeat:${hospitalId}`;

let cacheModulePromise: Promise<CacheModule> | null = null;
function loadCache(): Promise<CacheModule> {
  cacheModulePromise ??= import('@/lib/cache');
  return cacheModulePromise;
}

export async function recordAgentHeartbeat(
  hospitalId: string,
  heartbeat: AgentHeartbeat,
): Promise<void> {
  const cache = await loadCache();
  await cache.cacheSetJson(key(hospitalId), heartbeat, HEARTBEAT_TTL_SEC);
}

export async function getAgentHeartbeat(
  hospitalId: string,
): Promise<AgentHeartbeat | null> {
  const cache = await loadCache();
  return cache.cacheGetJson<AgentHeartbeat>(key(hospitalId));
}

/**
 * How long an agent may stay silent before the server-side backstop takes
 * over. The agent's default cycle is 5 minutes; 20 minutes means three
 * missed cycles before anyone else pulls for this hospital.
 */
export const AGENT_HEARTBEAT_STALE_MINUTES = 20;

export function isAgentHeartbeatFresh(
  heartbeat: AgentHeartbeat | null,
  now: Date = new Date(),
): boolean {
  if (!heartbeat) return false;
  const ageMs = now.getTime() - new Date(heartbeat.at).getTime();
  if (!Number.isFinite(ageMs)) return false;
  return ageMs <= AGENT_HEARTBEAT_STALE_MINUTES * 60_000;
}
