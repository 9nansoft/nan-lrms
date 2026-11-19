// The dashboard stream is shared by every signed-in user, so it is scoped.
//
// An event carries patient data — an admission number, a journey, a risk
// level. A viewer who may not read that patient must not receive it: the
// pages enforce that rule on every request, and the stream must not route
// around it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SseManager, type SseClientScope } from '@/lib/sse';

interface FakeClient {
  controller: ReadableStreamDefaultController;
  frames: string[];
}

function fakeClient(): FakeClient {
  const frames: string[] = [];
  const controller = {
    enqueue(chunk: Uint8Array) {
      frames.push(new TextDecoder().decode(chunk));
    },
  } as unknown as ReadableStreamDefaultController;
  return { controller, frames };
}

const MINE: SseClientScope = { all: false, hospitalIds: ['h-a'], hcodes: ['11002'] };
const THEIRS: SseClientScope = { all: false, hospitalIds: ['h-b'], hcodes: ['11004'] };
const PROVINCE: SseClientScope = { all: true, hospitalIds: [], hcodes: [] };

describe('the dashboard SSE stream is scoped', () => {
  let sse: SseManager;

  beforeEach(() => {
    SseManager.resetForTests();
    sse = SseManager.getInstance();
  });

  afterEach(() => {
    SseManager.resetForTests();
  });

  it('does not deliver another hospital’s patient event', () => {
    const mine = fakeClient();
    const other = fakeClient();
    sse.addClient('mine', mine.controller, undefined, MINE);
    sse.addClient('other', other.controller, undefined, THEIRS);

    sse.broadcast('patient-update', {
      type: 'new_admission',
      hcode: '11004',
      an: '6700000001',
    });

    // The admission number of another hospital never reaches this stream.
    expect(mine.frames).toHaveLength(0);
    expect(other.frames.join('')).toContain('6700000001');
  });

  it('delivers a hospital’s own event to its own client', () => {
    const mine = fakeClient();
    sse.addClient('mine', mine.controller, undefined, MINE);

    sse.broadcast('patient-update', {
      type: 'new_admission',
      hcode: '11002',
      an: '6700000002',
    });

    expect(mine.frames.join('')).toContain('6700000002');
  });

  it('delivers a referral event to both parties — the sender and the receiver', () => {
    const sender = fakeClient();
    const receiver = fakeClient();
    sse.addClient('sender', sender.controller, undefined, MINE);
    sse.addClient('receiver', receiver.controller, undefined, THEIRS);

    sse.broadcast('referral_update', {
      type: 'referral_update',
      fromHcode: '11002',
      toHcode: '11004',
      journeyId: 'journey-1',
    });

    expect(sender.frames.join('')).toContain('journey-1');
    expect(receiver.frames.join('')).toContain('journey-1');
  });

  it('delivers everything to a province-wide client', () => {
    const province = fakeClient();
    sse.addClient('province', province.controller, undefined, PROVINCE);

    sse.broadcast('patient-update', {
      type: 'new_admission',
      hcode: '11004',
      an: '6700000003',
    });

    expect(province.frames.join('')).toContain('6700000003');
  });

  it('keeps an event that names no hospital away from a scoped client', () => {
    // It cannot be attributed to a hospital, so it cannot be the scoped
    // viewer's business.
    const mine = fakeClient();
    const province = fakeClient();
    sse.addClient('mine', mine.controller, undefined, MINE);
    sse.addClient('province', province.controller, undefined, PROVINCE);

    sse.broadcast('sync-complete', { patientsUpdated: 3 });

    expect(mine.frames).toHaveLength(0);
    expect(province.frames.join('')).toContain('patientsUpdated');
  });

  it('matches a payload that names its hospital by id', () => {
    // The sync-status snapshot speaks in hospital ids, not codes.
    const mine = fakeClient();
    const other = fakeClient();
    sse.addClient('mine', mine.controller, undefined, MINE);
    sse.addClient('other', other.controller, undefined, THEIRS);

    sse.broadcast('sync-status', { hospitalId: 'h-b', status: 'idle' });

    expect(mine.frames).toHaveLength(0);
    expect(other.frames.join('')).toContain('h-b');
  });
});
