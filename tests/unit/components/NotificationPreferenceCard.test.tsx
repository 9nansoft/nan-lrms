// TDD — per-hospital, per-event notification preference card (2026-08-07).
//
// The first four cases come from the task brief: render, save, the
// own-hospital/aggregate distinction, and revert-on-error.
//
// The rest pin the gaps found while implementing:
//   - `moph_line_enabled` gates delivery in subscribersForEvent() but this card
//     has no switch for it, so a row left OFF by the old single-switch card
//     would silently swallow every event the nurse just ticked.
//   - adding a hospital already in the list saved it with an empty event set,
//     wiping the selections that were already there.
//   - a fresh user has no rows at all, so without a one-click "add my own
//     hospital" they must know their 5-digit code to get anywhere.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationPreferenceCard } from '@/components/profile/NotificationPreferenceCard';

const GET_BODY = {
  userCid: '3320500282121',
  ownHospitalCode: '10670',
  events: [
    {
      key: 'anc_hr3',
      tier: 'urgent',
      detail: 'patient',
      labelTh: 'ครรภ์เสี่ยงสูง (ANC HR3)',
      descriptionTh: 'พบหญิงตั้งครรภ์ที่จัดเป็นความเสี่ยงสูงระดับ HR3',
      implemented: true,
    },
    {
      key: 'labor_emergency',
      tier: 'urgent',
      detail: 'patient',
      labelTh: 'ภาวะฉุกเฉินในห้องคลอด',
      descriptionTh: 'ผลคัดกรองแรกรับเข้าเกณฑ์ฉุกเฉิน',
      implemented: true,
    },
  ],
  preferences: [
    {
      id: 'p1',
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: true,
      detailLevel: 'full',
      digestHour: 8,
      events: ['anc_hr3'],
    },
  ],
};

describe('NotificationPreferenceCard', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('renders one checkbox per event with the saved state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => GET_BODY }) as Response),
    );
    render(<NotificationPreferenceCard />);
    const anc = await screen.findByRole('checkbox', { name: /ANC HR3/ });
    expect(anc).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ })).not.toBeChecked();
  });

  it('PUTs the full event set when a checkbox is toggled', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => GET_BODY } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...GET_BODY.preferences[0], events: ['anc_hr3', 'labor_emergency'] }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
      const put = calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body)).events.sort()).toEqual([
        'anc_hr3',
        'labor_emergency',
      ]);
    });
  });

  it('labels the session hospital and warns that others are aggregate-only', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({
              ...GET_BODY,
              preferences: [
                ...GET_BODY.preferences,
                {
                  id: 'p2',
                  userCid: '3320500282121',
                  hospitalCode: '11002',
                  mophLineEnabled: true,
                  detailLevel: 'aggregate',
                  digestHour: 8,
                  events: ['anc_hr3'],
                },
              ],
            }),
          }) as Response,
      ),
    );
    render(<NotificationPreferenceCard />);
    expect(await screen.findByText(/โรงพยาบาลของคุณ/)).toBeInTheDocument();
    expect(screen.getByText(/เฉพาะยอดรวม/)).toBeInTheDocument();
    // A nurse recognises the hospital by name, not by its 5-digit code.
    expect(screen.getByText(/รพ\.บ้านไผ่/)).toBeInTheDocument();
  });

  it('shows an actionable Thai error and reverts when saving fails', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => GET_BODY } as Response;
      return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ }));

    expect(await screen.findByText(/บันทึกไม่สำเร็จ/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /ฉุกเฉินในห้องคลอด/ })).not.toBeChecked(),
    );
  });

  // A body without the arrays used to throw inside render, blanking the whole
  // profile page. Not knowing the saved settings must read as a load failure,
  // never as "you follow nothing" — that would invite re-adding what is
  // already there.
  it('reports a load failure instead of crashing on a malformed response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
    );
    render(<NotificationPreferenceCard />);
    expect(await screen.findByText(/โหลดการตั้งค่าไม่สำเร็จ/)).toBeInTheDocument();
    expect(screen.queryByText(/ยังไม่ได้ติดตามโรงพยาบาลใด/)).not.toBeInTheDocument();
  });

  it('tells the user it is loading before the preferences arrive', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<NotificationPreferenceCard />);
    expect(await screen.findByText(/กำลังโหลด/)).toBeInTheDocument();
  });

  // moph_line_enabled is ANDed into subscribersForEvent(). Sending back the
  // stored `false` would produce a card full of ticked boxes that delivers
  // nothing, with no way to see why.
  it('turns LINE delivery on for the hospital when an event is selected', async () => {
    const optedOut = {
      ...GET_BODY,
      preferences: [{ ...GET_BODY.preferences[0], mophLineEnabled: false, events: [] }],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => optedOut } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ...optedOut.preferences[0],
          mophLineEnabled: true,
          events: ['anc_hr3'],
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ANC HR3/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
      const put = calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
        mophLineEnabled: true,
        events: ['anc_hr3'],
      });
    });
  });

  it('turns LINE delivery off for the hospital when the last event is cleared', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => GET_BODY } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ...GET_BODY.preferences[0], mophLineEnabled: false, events: [] }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('checkbox', { name: /ANC HR3/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
      const put = calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({
        mophLineEnabled: false,
        events: [],
      });
    });
  });

  // REMOVED 2026-08-07: two tests covered client-side validation of the
  // free-text "add any hospital" box (non-5-digit code, already-followed code).
  // That control is withdrawn — the API now refuses any hospital other than the
  // session's, because alert content still carries the patient's case reference
  // (an ANC caseRef embeds the national ID) to every recipient scope. The tests
  // are obsolete rather than inconvenient: the behaviour they guarded no longer
  // exists. The server-side refusal is pinned in
  // tests/unit/api/profile-notification-preference.test.ts
  // ('REFUSES a subscription to a hospital that is not the session hospital').

  it('offers a one-click add for the session hospital when nothing is followed yet', async () => {
    const empty = { ...GET_BODY, preferences: [] };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => empty } as Response;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'p9',
          userCid: '3320500282121',
          hospitalCode: '10670',
          mophLineEnabled: false,
          detailLevel: 'full',
          digestHour: 8,
          events: [],
        }),
      } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('button', { name: /เพิ่มโรงพยาบาลของคุณ/ }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as [string, RequestInit | undefined][];
      const put = calls.find((c) => c[1]?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse(String(put?.[1]?.body))).toMatchObject({ hospitalCode: '10670' });
    });
    expect(await screen.findByRole('checkbox', { name: /ANC HR3/ })).not.toBeChecked();
  });

  it('stops following a hospital and restores the row when the delete fails', async () => {
    const twoRows = {
      ...GET_BODY,
      preferences: [
        ...GET_BODY.preferences,
        {
          id: 'p2',
          userCid: '3320500282121',
          hospitalCode: '11002',
          mophLineEnabled: true,
          detailLevel: 'aggregate',
          digestHour: 8,
          events: ['anc_hr3'],
        },
      ],
    };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === undefined)
        return { ok: true, status: 200, json: async () => twoRows } as Response;
      return { ok: false, status: 500, json: async () => ({ error: 'boom' }) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<NotificationPreferenceCard />);

    await user.click(await screen.findByRole('button', { name: /เลิกติดตาม 11002/ }));

    expect(await screen.findByText(/ลบไม่สำเร็จ/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/รพ\.บ้านไผ่/)).toBeInTheDocument());
  });
});
