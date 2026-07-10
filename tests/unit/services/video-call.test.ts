// Video-call service state machine: ringing → accepted | declined | cancelled |
// missed; accepted → ended. Uses real PGlite, real in-memory presence (no
// REDIS_URL in tests) and the real SseManager with captured stream controllers.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Session } from 'next-auth';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { SseManager } from '@/lib/sse';
import { recordOnlineUser } from '@/lib/presence';
import { cacheDelPattern } from '@/lib/cache';
import {
  createCall,
  acceptCall,
  declineCall,
  cancelCall,
  endCall,
  getCall,
  VideoCallError,
  clearCallTimersForTests,
  type CallActor,
} from '@/services/video-call';

const CALLER: CallActor = {
  userId: 'user-caller',
  name: 'พญ.ต้นทาง ทดสอบ',
  hospitalCode: '10670',
  hospitalName: 'รพ.ขอนแก่น',
};
const CALLEE: CallActor = {
  userId: 'user-callee',
  name: 'นพ.ปลายทาง ทดสอบ',
  hospitalCode: '11004',
  hospitalName: 'รพ.น้ำพอง',
};

function fakeSession(actor: CallActor): Session {
  return {
    user: {
      id: actor.userId,
      name: actor.name,
      role: 'user',
      hospitalCode: actor.hospitalCode,
      hospitalName: actor.hospitalName,
      authProvider: 'test',
      accessMode: 'full',
    },
    expires: new Date(Date.now() + 3_600_000).toISOString(),
  } as unknown as Session;
}

interface CapturedEvent {
  event: string;
  data: Record<string, unknown>;
}

// Register a fake browser tab on the real SseManager and decode what it receives.
function connectTab(userId: string, tabId: string) {
  const chunks: Uint8Array[] = [];
  const controller = {
    enqueue: (chunk: Uint8Array) => chunks.push(chunk),
    close: () => {},
  } as unknown as ReadableStreamDefaultController;
  SseManager.getInstance().addClient(tabId, controller, userId);
  return {
    events(): CapturedEvent[] {
      const decoder = new TextDecoder();
      const text = chunks.map((c) => decoder.decode(c)).join('');
      return text
        .split('\n\n')
        .filter((block) => block.startsWith('event: '))
        .map((block) => {
          const [eventLine, dataLine] = block.split('\n');
          return {
            event: eventLine.replace('event: ', ''),
            data: JSON.parse(dataLine.replace('data: ', '')),
          };
        });
    },
  };
}

async function bothOnline(): Promise<void> {
  await recordOnlineUser(fakeSession(CALLER));
  await recordOnlineUser(fakeSession(CALLEE));
}

describe('video-call service', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
    SseManager.resetForTests();
    clearCallTimersForTests();
    await cacheDelPattern('presence:users:*');
  });

  describe('createCall', () => {
    it('inserts a ringing row with caller/callee snapshots and an unguessable room id', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId);

      expect(call.callId).toMatch(/^[0-9a-f-]{36}$/);
      expect(call.roomId).toMatch(/^kklrms-[0-9a-f-]{36}$/);
      expect(call.callee.name).toBe(CALLEE.name);

      const rows = await db.query<Record<string, unknown>>(
        'SELECT * FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe('ringing');
      expect(rows[0].caller_name).toBe(CALLER.name);
      expect(rows[0].caller_hospital_code).toBe(CALLER.hospitalCode);
      expect(rows[0].callee_name).toBe(CALLEE.name);
      expect(rows[0].callee_hospital_code).toBe(CALLEE.hospitalCode);
      expect(rows[0].answered_at).toBeNull();
    });

    it('rings every tab of the callee with caller identity and room id', async () => {
      await bothOnline();
      const tab1 = connectTab(CALLEE.userId, 'callee-tab-1');
      const tab2 = connectTab(CALLEE.userId, 'callee-tab-2');
      const callerTab = connectTab(CALLER.userId, 'caller-tab-1');

      const call = await createCall(db, CALLER, CALLEE.userId);

      for (const tab of [tab1, tab2]) {
        const invites = tab.events().filter((e) => e.event === 'call:invite');
        expect(invites).toHaveLength(1);
        expect(invites[0].data.callId).toBe(call.callId);
        expect(invites[0].data.roomId).toBe(call.roomId);
        expect((invites[0].data.caller as CallActor).name).toBe(CALLER.name);
        expect((invites[0].data.caller as CallActor).hospitalName).toBe(CALLER.hospitalName);
      }
      expect(callerTab.events()).toHaveLength(0);
    });

    it('rejects an offline callee with an actionable Thai error', async () => {
      await recordOnlineUser(fakeSession(CALLER)); // callee NOT online
      await expect(createCall(db, CALLER, CALLEE.userId)).rejects.toMatchObject({
        code: 'CALLEE_OFFLINE',
      });
      await expect(createCall(db, CALLER, CALLEE.userId)).rejects.toThrowError(/ออนไลน์/);
    });

    it('rejects when the callee is already in a call', async () => {
      await bothOnline();
      await createCall(db, CALLER, CALLEE.userId);

      const thirdUser: CallActor = {
        userId: 'user-third',
        name: 'นส.สาม ทดสอบ',
        hospitalCode: '11005',
        hospitalName: 'รพ.ชนบท',
      };
      await recordOnlineUser(fakeSession(thirdUser));
      await expect(createCall(db, thirdUser, CALLEE.userId)).rejects.toMatchObject({
        code: 'BUSY',
      });
    });

    it('rejects when the caller already has an active call', async () => {
      await bothOnline();
      const thirdUser: CallActor = {
        userId: 'user-third',
        name: 'นส.สาม ทดสอบ',
        hospitalCode: '11005',
        hospitalName: 'รพ.ชนบท',
      };
      await recordOnlineUser(fakeSession(thirdUser));
      await createCall(db, CALLER, CALLEE.userId);
      await expect(createCall(db, CALLER, thirdUser.userId)).rejects.toMatchObject({
        code: 'BUSY',
      });
    });

    it('rejects calling yourself', async () => {
      await bothOnline();
      await expect(createCall(db, CALLER, CALLER.userId)).rejects.toMatchObject({
        code: 'SELF_CALL',
      });
    });

    it('does not let a stale ringing row (dead server timer) block new calls forever', async () => {
      await bothOnline();
      // Simulate a ring orphaned by a server restart: older than any live timer.
      await db.execute(
        `INSERT INTO video_calls
           (id, room_id, caller_user_id, caller_name, caller_hospital_code,
            callee_user_id, callee_name, callee_hospital_code, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ringing', NOW() - INTERVAL '10 minutes')`,
        [
          'aaaaaaaa-0000-4000-8000-000000000001',
          'kklrms-stale',
          CALLER.userId,
          CALLER.name,
          CALLER.hospitalCode,
          CALLEE.userId,
          CALLEE.name,
          CALLEE.hospitalCode,
        ],
      );

      const call = await createCall(db, CALLER, CALLEE.userId);
      expect(call.callId).toBeTruthy();

      const stale = await db.query<{ status: string }>(
        'SELECT status FROM video_calls WHERE id = ?',
        ['aaaaaaaa-0000-4000-8000-000000000001'],
      );
      expect(stale[0].status).toBe('missed');
    });
  });

  describe('accept / decline / cancel / end', () => {
    it('accept: marks accepted, notifies caller with room id, resolves callee tabs', async () => {
      await bothOnline();
      const callerTab = connectTab(CALLER.userId, 'caller-tab');
      const call = await createCall(db, CALLER, CALLEE.userId);
      const calleeTab = connectTab(CALLEE.userId, 'callee-tab-late');

      const result = await acceptCall(db, call.callId, CALLEE);
      expect(result.roomId).toBe(call.roomId);

      const rows = await db.query<{ status: string; answered_at: Date | null }>(
        'SELECT status, answered_at FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows[0].status).toBe('accepted');
      expect(rows[0].answered_at).not.toBeNull();

      const accepted = callerTab.events().filter((e) => e.event === 'call:accepted');
      expect(accepted).toHaveLength(1);
      expect(accepted[0].data.roomId).toBe(call.roomId);

      const resolved = calleeTab.events().filter((e) => e.event === 'call:resolved');
      expect(resolved).toHaveLength(1);
      expect(resolved[0].data.status).toBe('accepted');
    });

    it('only the callee may accept', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId);
      await expect(acceptCall(db, call.callId, CALLER)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('accept on a non-ringing call is an invalid state', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId);
      await acceptCall(db, call.callId, CALLEE);
      await expect(acceptCall(db, call.callId, CALLEE)).rejects.toMatchObject({
        code: 'INVALID_STATE',
      });
    });

    it('decline: marks declined and notifies the caller', async () => {
      await bothOnline();
      const callerTab = connectTab(CALLER.userId, 'caller-tab');
      const call = await createCall(db, CALLER, CALLEE.userId);

      await declineCall(db, call.callId, CALLEE);

      const rows = await db.query<{ status: string }>(
        'SELECT status FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows[0].status).toBe('declined');
      expect(callerTab.events().some((e) => e.event === 'call:declined')).toBe(true);
    });

    it('cancel: only the caller, stops the callee ring', async () => {
      await bothOnline();
      const calleeTab = connectTab(CALLEE.userId, 'callee-tab');
      const call = await createCall(db, CALLER, CALLEE.userId);

      await expect(cancelCall(db, call.callId, CALLEE)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await cancelCall(db, call.callId, CALLER);

      const rows = await db.query<{ status: string; ended_at: Date | null }>(
        'SELECT status, ended_at FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows[0].status).toBe('cancelled');
      expect(rows[0].ended_at).not.toBeNull();
      expect(calleeTab.events().some((e) => e.event === 'call:cancelled')).toBe(true);
    });

    it('end: either participant ends an accepted call and the peer is notified', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId);
      await acceptCall(db, call.callId, CALLEE);
      const calleeTab = connectTab(CALLEE.userId, 'callee-tab');

      await endCall(db, call.callId, CALLER);

      const rows = await db.query<{ status: string; ended_at: Date | null }>(
        'SELECT status, ended_at FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows[0].status).toBe('ended');
      expect(rows[0].ended_at).not.toBeNull();
      expect(calleeTab.events().some((e) => e.event === 'call:ended')).toBe(true);
    });

    it('acting on an unknown call id is NOT_FOUND', async () => {
      await expect(
        acceptCall(db, '00000000-0000-4000-8000-000000000000', CALLEE),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('ring timeout', () => {
    it('marks an unanswered call missed and tells the caller', async () => {
      await bothOnline();
      const callerTab = connectTab(CALLER.userId, 'caller-tab');
      const call = await createCall(db, CALLER, CALLEE.userId, { ringTimeoutMs: 60 });

      await vi.waitFor(
        async () => {
          const rows = await db.query<{ status: string }>(
            'SELECT status FROM video_calls WHERE id = ?',
            [call.callId],
          );
          expect(rows[0].status).toBe('missed');
        },
        { timeout: 5000, interval: 25 },
      );
      expect(callerTab.events().some((e) => e.event === 'call:missed')).toBe(true);
    });

    it('accepting clears the timer so the call is not later marked missed', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId, { ringTimeoutMs: 60 });
      await acceptCall(db, call.callId, CALLEE);

      await new Promise((resolve) => setTimeout(resolve, 150));

      const rows = await db.query<{ status: string }>(
        'SELECT status FROM video_calls WHERE id = ?',
        [call.callId],
      );
      expect(rows[0].status).toBe('accepted');
    });
  });

  describe('getCall', () => {
    it('returns the call to participants and hides it from strangers', async () => {
      await bothOnline();
      const call = await createCall(db, CALLER, CALLEE.userId);

      const forCaller = await getCall(db, call.callId, CALLER.userId);
      expect(forCaller.roomId).toBe(call.roomId);
      expect(forCaller.status).toBe('ringing');
      expect(forCaller.callerName).toBe(CALLER.name);
      expect(forCaller.calleeName).toBe(CALLEE.name);

      await expect(getCall(db, call.callId, 'user-stranger')).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        getCall(db, '00000000-0000-4000-8000-000000000000', CALLER.userId),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  it('VideoCallError carries Thai, actionable messages', async () => {
    await recordOnlineUser(fakeSession(CALLER));
    try {
      await createCall(db, CALLER, CALLEE.userId);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(VideoCallError);
      // Thai script + a hint about what to do next
      expect((error as Error).message).toMatch(/[ก-๙]/);
    }
  });
});
