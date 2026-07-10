// Video-call API routes — TDD: auth guards, participant guards, HTTP mapping
// of VideoCallError codes, presence-backed directory, and per-user SSE stream.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from 'next-auth';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { SseManager } from '@/lib/sse';
import { recordOnlineUser } from '@/lib/presence';
import { cacheDelPattern } from '@/lib/cache';
import { clearCallTimersForTests } from '@/services/video-call';

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({
  getDatabase: async () => db,
}));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({
  ensureInit: async () => {},
}));

import { POST as createCallRoute } from '@/app/api/calls/route';
import { GET as getCallRoute } from '@/app/api/calls/[id]/route';
import { POST as acceptRoute } from '@/app/api/calls/[id]/accept/route';
import { POST as declineRoute } from '@/app/api/calls/[id]/decline/route';
import { POST as cancelRoute } from '@/app/api/calls/[id]/cancel/route';
import { POST as endRoute } from '@/app/api/calls/[id]/end/route';
import { GET as directoryRoute } from '@/app/api/calls/directory/route';
import { GET as callsSseRoute } from '@/app/api/sse/calls/route';

const CALLER_USER = {
  id: 'user-caller',
  name: 'พญ.ต้นทาง ทดสอบ',
  role: 'user',
  hospitalCode: '10670',
  hospitalName: 'รพ.ขอนแก่น',
  authProvider: 'test',
  accessMode: 'full',
};
const CALLEE_USER = {
  id: 'user-callee',
  name: 'นพ.ปลายทาง ทดสอบ',
  role: 'user',
  hospitalCode: '11004',
  hospitalName: 'รพ.น้ำพอง',
  authProvider: 'test',
  accessMode: 'full',
};

function sessionFor(user: typeof CALLER_USER): Session {
  return {
    user: { ...user },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session;
}

async function bothOnline(): Promise<void> {
  await recordOnlineUser(sessionFor(CALLER_USER));
  await recordOnlineUser(sessionFor(CALLEE_USER));
}

function postJson(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function params(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

async function placeCall(): Promise<{ callId: string; roomId: string }> {
  mockSessionUser = CALLER_USER;
  const res = await createCallRoute(
    postJson('http://test/api/calls', { calleeUserId: CALLEE_USER.id }) as never,
  );
  expect(res.status).toBe(201);
  return res.json();
}

describe('video-call API routes', () => {
  beforeEach(async () => {
    db = await createTestDb();
    SseManager.resetForTests();
    clearCallTimersForTests();
    await cacheDelPattern('presence:users:*');
    mockSessionUser = null;
  });

  describe('POST /api/calls', () => {
    it('401 without a session', async () => {
      const res = await createCallRoute(
        postJson('http://test/api/calls', { calleeUserId: 'x' }) as never,
      );
      expect(res.status).toBe(401);
    });

    it('400 when calleeUserId is missing', async () => {
      mockSessionUser = CALLER_USER;
      const res = await createCallRoute(postJson('http://test/api/calls', {}) as never);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toMatch(/[ก-๙]/);
    });

    it('creates a call and returns callId + roomId', async () => {
      await bothOnline();
      const { callId, roomId } = await placeCall();
      expect(callId).toMatch(/^[0-9a-f-]{36}$/);
      expect(roomId).toMatch(/^kklrms-/);
    });

    it('409 with Thai message when the callee is offline', async () => {
      await recordOnlineUser(sessionFor(CALLER_USER));
      mockSessionUser = CALLER_USER;
      const res = await createCallRoute(
        postJson('http://test/api/calls', { calleeUserId: CALLEE_USER.id }) as never,
      );
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.code).toBe('CALLEE_OFFLINE');
      expect(body.message).toMatch(/ออนไลน์/);
    });

    it('409 BUSY when the callee is already ringing', async () => {
      await bothOnline();
      await placeCall();
      const third = { ...CALLER_USER, id: 'user-third', name: 'นส.สาม ทดสอบ' };
      await recordOnlineUser(sessionFor(third));
      mockSessionUser = third;
      const res = await createCallRoute(
        postJson('http://test/api/calls', { calleeUserId: CALLEE_USER.id }) as never,
      );
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe('BUSY');
    });
  });

  describe('call lifecycle routes', () => {
    it('accept: 401 unauthenticated, 403 for the caller, 200 with roomId for the callee', async () => {
      await bothOnline();
      const { callId, roomId } = await placeCall();

      mockSessionUser = null;
      expect((await acceptRoute(postJson('http://t') as never, params(callId))).status).toBe(401);

      mockSessionUser = CALLER_USER;
      expect((await acceptRoute(postJson('http://t') as never, params(callId))).status).toBe(403);

      mockSessionUser = CALLEE_USER;
      const res = await acceptRoute(postJson('http://t') as never, params(callId));
      expect(res.status).toBe(200);
      expect((await res.json()).roomId).toBe(roomId);
    });

    it('accept: 404 for unknown call, 409 for non-ringing call', async () => {
      mockSessionUser = CALLEE_USER;
      const unknown = await acceptRoute(
        postJson('http://t') as never,
        params('00000000-0000-4000-8000-000000000000'),
      );
      expect(unknown.status).toBe(404);

      await bothOnline();
      const { callId } = await placeCall();
      mockSessionUser = CALLEE_USER;
      await acceptRoute(postJson('http://t') as never, params(callId));
      const again = await acceptRoute(postJson('http://t') as never, params(callId));
      expect(again.status).toBe(409);
    });

    it('decline / cancel / end map to the service transitions', async () => {
      await bothOnline();
      const first = await placeCall();
      mockSessionUser = CALLEE_USER;
      expect((await declineRoute(postJson('http://t') as never, params(first.callId))).status).toBe(
        200,
      );

      const second = await placeCall();
      mockSessionUser = CALLER_USER;
      expect((await cancelRoute(postJson('http://t') as never, params(second.callId))).status).toBe(
        200,
      );

      const third = await placeCall();
      mockSessionUser = CALLEE_USER;
      await acceptRoute(postJson('http://t') as never, params(third.callId));
      mockSessionUser = CALLER_USER;
      expect((await endRoute(postJson('http://t') as never, params(third.callId))).status).toBe(
        200,
      );

      const statuses = await db.query<{ id: string; status: string }>(
        'SELECT id, status FROM video_calls',
      );
      const byId = new Map(statuses.map((r) => [r.id, r.status]));
      expect(byId.get(first.callId)).toBe('declined');
      expect(byId.get(second.callId)).toBe('cancelled');
      expect(byId.get(third.callId)).toBe('ended');
    });
  });

  describe('GET /api/calls/[id]', () => {
    it('returns the call to a participant and 403 to strangers', async () => {
      await bothOnline();
      const { callId, roomId } = await placeCall();

      mockSessionUser = CALLEE_USER;
      const res = await getCallRoute(new Request('http://t') as never, params(callId));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.roomId).toBe(roomId);
      expect(body.callerName).toBe(CALLER_USER.name);

      mockSessionUser = { ...CALLER_USER, id: 'user-stranger' };
      const forbidden = await getCallRoute(new Request('http://t') as never, params(callId));
      expect(forbidden.status).toBe(403);
    });
  });

  describe('GET /api/calls/directory', () => {
    it('401 without a session', async () => {
      const res = await directoryRoute();
      expect(res.status).toBe(401);
    });

    it('groups online users by hospital and excludes the requester', async () => {
      await bothOnline();
      const colleague = { ...CALLER_USER, id: 'user-colleague', name: 'นางเพื่อน ร่วมงาน' };
      await recordOnlineUser(sessionFor(colleague));

      mockSessionUser = CALLER_USER;
      const res = await directoryRoute();
      expect(res.status).toBe(200);
      const body = await res.json();

      const allUserIds = body.hospitals.flatMap((h: { users: { userId: string }[] }) =>
        h.users.map((u) => u.userId),
      );
      expect(allUserIds).toContain(CALLEE_USER.id);
      expect(allUserIds).toContain('user-colleague');
      expect(allUserIds).not.toContain(CALLER_USER.id);

      const khonKaen = body.hospitals.find(
        (h: { hospitalCode: string }) => h.hospitalCode === '10670',
      );
      expect(khonKaen.hospitalName).toBe('รพ.ขอนแก่น');
      expect(khonKaen.users).toHaveLength(1);
    });
  });

  describe('GET /api/sse/calls', () => {
    it('401 without a session', async () => {
      const res = await callsSseRoute();
      expect(res.status).toBe(401);
    });

    it('opens a per-user event stream targetable by sendToUser', async () => {
      mockSessionUser = CALLEE_USER;
      const res = await callsSseRoute();
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');

      // The stream must be registered under the session user id.
      const delivered = SseManager.getInstance().sendToUser(CALLEE_USER.id, 'call:test', {});
      expect(delivered).toBe(1);
    });
  });
});
