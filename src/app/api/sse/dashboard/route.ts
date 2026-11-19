// T051: GET /api/sse/dashboard — SSE stream for real-time dashboard updates
//
// The stream is shared by every signed-in user, so it is SCOPED: an event
// about another hospital's patient (its admission number, its journey, its
// risk level) must not reach a viewer who may not read that patient. The
// pages enforce that rule on every request; the stream must not route around
// it.
import { v4 as uuidv4 } from 'uuid';
import { ensureInit } from '@/lib/ensure-init';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { SseManager, type SseClientScope } from '@/lib/sse';
import {
  resolveViewerScope,
  scopeAllowedHcodes,
  type ViewerScope,
} from '@/services/visibility-scope';

/**
 * The hospitals this stream may talk about.
 *
 * A viewer with no session hears nothing about any hospital: the stream
 * carries patient events, so an anonymous listener gets no events at all.
 */
async function resolveStreamScope(): Promise<SseClientScope> {
  const session = await auth();
  const hospitalCode = session?.user?.hospitalCode ?? null;
  const db = await getDatabase();
  const scope: ViewerScope = await resolveViewerScope(db, hospitalCode);
  if (scope.mode === 'ALL') {
    return { all: true, hospitalIds: [], hcodes: [] };
  }
  return {
    all: false,
    hospitalIds: scope.allowedHospitalIds,
    hcodes: await scopeAllowedHcodes(db, scope),
  };
}

export async function GET() {
  await ensureInit();
  const clientId = uuidv4();
  const sseManager = SseManager.getInstance();
  const scope = await resolveStreamScope();

  const stream = new ReadableStream({
    start(controller) {
      sseManager.addClient(clientId, controller, undefined, scope);

      // Send initial connection event
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`),
      );
    },
    cancel() {
      sseManager.removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
