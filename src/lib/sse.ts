// T038: SSE event emitter — singleton SseManager
//
// Supports two delivery modes:
//   broadcast(event, data)          — every connected client (dashboard updates)
//   sendToUser(userId, event, data) — every tab of one user (video-call signaling)

interface SseClient {
  id: string;
  controller: ReadableStreamDefaultController;
  // Set for authenticated per-user streams (/api/sse/calls); undefined for
  // anonymous broadcast streams (/api/sse/dashboard).
  userId?: string;
  /**
   * The hospitals this client may hear about. Undefined = no scope was
   * registered (an internal stream) — the event is delivered as it is.
   */
  scope?: SseClientScope;
}

/**
 * The hospitals a connected client may hear about.
 *
 * The dashboard stream is shared by every signed-in user, so an event must
 * only reach the viewers whose scope covers the hospital it is about: an
 * admission number of another hospital is patient data the viewer may not
 * read. The pages enforce that rule on every request — the stream must not
 * route around it.
 */
export interface SseClientScope {
  /** The viewer reads every hospital's patients (the province, the centre). */
  all: boolean;
  /** The hospital ids in the viewer's scope. */
  hospitalIds: string[];
  /** The hospital codes in the viewer's scope. */
  hcodes: string[];
}

/**
 * The hospitals a broadcast payload speaks about.
 *
 * Payloads name their hospital as a code (`hcode`), as an id (`hospitalId`),
 * or as the two parties of a referral or a transfer (`fromHcode` /
 * `toHcode`). An event that names none cannot be attributed to a hospital —
 * it goes to the province-wide viewers only.
 */
function payloadHospitals(data: unknown): { hospitalIds: string[]; hcodes: string[] } {
  if (!data || typeof data !== 'object') return { hospitalIds: [], hcodes: [] };
  const d = data as Record<string, unknown>;
  const hospitalIds = typeof d.hospitalId === 'string' && d.hospitalId ? [d.hospitalId] : [];
  const hcodes = ['hcode', 'fromHcode', 'toHcode']
    .filter((key) => typeof d[key] === 'string' && d[key] !== '')
    .map((key) => d[key] as string);
  return { hospitalIds, hcodes };
}

// Next.js bundles route handlers separately and reloads modules on HMR, so a
// static-field singleton fragments into one instance per bundle — a call
// placed through /api/calls would ring into a different client map than the
// one /api/sse/calls registered with. Pinning on globalThis guarantees one
// instance per Node process (same pattern as __dbSingleton / __pgliteLock).
const _global = globalThis as unknown as { __sseManager?: SseManager };

export class SseManager {
  private clients: Map<string, SseClient> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    // Start heartbeat every 30s to keep connections alive
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  static getInstance(): SseManager {
    if (!_global.__sseManager) {
      _global.__sseManager = new SseManager();
    }
    return _global.__sseManager;
  }

  /** Tear down the singleton and its globalThis pin so tests start clean. */
  static resetForTests(): void {
    _global.__sseManager?.destroy();
    _global.__sseManager = undefined;
  }

  addClient(
    id: string,
    controller: ReadableStreamDefaultController,
    userId?: string,
    scope?: SseClientScope,
  ): void {
    this.clients.set(id, { id, controller, userId, scope });
  }

  removeClient(id: string): void {
    this.clients.delete(id);
  }

  broadcast(event: string, data: unknown): void {
    const encoded = encodeEvent(event, data);
    const { hospitalIds, hcodes } = payloadHospitals(data);
    for (const [clientId, client] of this.clients) {
      if (!this.eventReachesClient(client, hospitalIds, hcodes)) continue;
      this.enqueueOrDrop(clientId, client, encoded);
    }
  }

  /**
   * True when the event is about a hospital this client may read.
   *
   * A client with no scope (an internal stream) hears everything. A
   * province-wide client hears everything. A scoped client hears only the
   * events about the hospitals in its scope — the same rule the pages apply
   * to every request.
   */
  private eventReachesClient(
    client: SseClient,
    hospitalIds: string[],
    hcodes: string[],
  ): boolean {
    const scope = client.scope;
    if (!scope || scope.all) return true;
    if (hospitalIds.length === 0 && hcodes.length === 0) {
      // The event names no hospital: it cannot be attributed, so it cannot
      // be the scoped viewer's business.
      return false;
    }
    return (
      hospitalIds.some((id) => scope.hospitalIds.includes(id)) ||
      hcodes.some((code) => scope.hcodes.includes(code))
    );
  }

  /**
   * Deliver an event to every connected tab of one user. Returns the number
   * of tabs reached — 0 means the user has no live stream (offline or all
   * tabs dead), which callers like the video-call service surface as
   * "callee unreachable" instead of ringing into the void.
   */
  sendToUser(userId: string, event: string, data: unknown): number {
    const encoded = encodeEvent(event, data);
    let delivered = 0;
    for (const [clientId, client] of this.clients) {
      if (client.userId === undefined || client.userId !== userId) continue;
      if (this.enqueueOrDrop(clientId, client, encoded)) delivered++;
    }
    return delivered;
  }

  /** Enqueue to one client; on failure remove it. Returns delivery success. */
  private enqueueOrDrop(clientId: string, client: SseClient, chunk: Uint8Array): boolean {
    try {
      client.controller.enqueue(chunk);
      return true;
    } catch {
      // Client disconnected — remove
      this.clients.delete(clientId);
      return false;
    }
  }

  private sendHeartbeat(): void {
    const encoder = new TextEncoder();
    const ping = encoder.encode(': ping\n\n');
    for (const [clientId, client] of this.clients) {
      this.enqueueOrDrop(clientId, client, ping);
    }
  }

  getClientCount(): number {
    return this.clients.size;
  }

  destroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clients.clear();
  }
}

function encodeEvent(event: string, data: unknown): Uint8Array {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(message);
}
