// TDD — chat panel controls (2026-08-06).
//
// The panel could only send and receive: no way to start over, no way to stop a
// slow turn, no way to copy an answer, no hint of what it can answer, and no
// indication of where an answer came from. Knowledge-base lookups take ~20s, so
// "no stop button" was the worst of these.
//
// The reset assertion is the load-bearing one: the transcript lives in Redis,
// so clearing only the local list would leave the bot remembering a
// conversation the user believes they ended.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClinicalChatPanel } from '@/components/chat/ClinicalChatPanel';

vi.mock('@/contexts/BmsSessionContext', () => ({
  useBmsSession: () => ({ sessionId: 'bms-test-session' }),
}));

// jsdom implements no scrolling API; the panel auto-scrolls to the newest turn.
beforeAll(() => {
  Element.prototype.scrollTo = vi.fn();
});

function jsonResponse(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe('ClinicalChatPanel — conversation controls', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function openPanel() {
    const user = userEvent.setup();
    render(<ClinicalChatPanel mode="statistics" />);
    await user.click(screen.getByRole('button', { name: /ขยายหน้าต่างแชท/ }));
    return user;
  }

  it('offers mode-aware starter questions and asks one on click', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ answer: '9 คน', sources: ['get_stage_kpis'] }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const user = await openPanel();

    const starter = screen.getByRole('button', { name: 'ตอนนี้มีคนรอคลอดกี่คน' });
    await user.click(starter);

    await waitFor(() => expect(screen.getByText('9 คน')).toBeInTheDocument());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(String(calls[0][1].body));
    expect(body).toMatchObject({ message: 'ตอนนี้มีคนรอคลอดกี่คน', mode: 'statistics' });
  });

  it('shows which tools produced the answer (provenance)', async () => {
    vi.stubGlobal('fetch', async () =>
      jsonResponse({ answer: 'ตอบแล้ว', sources: ['get_stage_kpis', 'ask_medical_ebook'] }),
    );
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'ตอนนี้มีคนรอคลอดกี่คน' }));

    await waitFor(() => expect(screen.getByText('สถิติรายระยะ')).toBeInTheDocument());
    expect(screen.getByText('ตำราแพทย์')).toBeInTheDocument();
  });

  it('reset clears the SERVER transcript, not just the local list', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ answer: 'คำตอบ', sources: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'ตอนนี้มีคนรอคลอดกี่คน' }));
    await waitFor(() => expect(screen.getByText('คำตอบ')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'เริ่มบทสนทนาใหม่' }));

    await waitFor(() => expect(screen.queryByText('คำตอบ')).not.toBeInTheDocument());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
    const deleteCall = calls.find((c) => c[1]?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall?.[0])).toContain('mode=statistics');
  });

  it('exposes a stop button while a turn is in flight and reports the stop', async () => {
    // Never resolves until aborted — models the ~20s knowledge lookup.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'ตอนนี้มีคนรอคลอดกี่คน' }));

    const stopButton = await screen.findByRole('button', { name: 'หยุดการตอบ' });
    await user.click(stopButton);

    await waitFor(() => expect(screen.getByText('หยุดแล้ว')).toBeInTheDocument());
  });

  it('offers a retry after a failed turn', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'ผู้ช่วยแชทไม่พร้อมใช้งาน' }, 502));
    const user = await openPanel();
    await user.click(screen.getByRole('button', { name: 'ตอนนี้มีคนรอคลอดกี่คน' }));

    await waitFor(() => expect(screen.getByText('ผู้ช่วยแชทไม่พร้อมใช้งาน')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /ลองถามใหม่อีกครั้ง/ })).toBeInTheDocument();
  });
});
