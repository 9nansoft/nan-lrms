import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfilePage } from '@/app/(hospital)/profile/page';

vi.mock('@/lib/auth', () => ({
  auth: async () => ({
    user: {
      name: 'นาย ชัยพร สุรเตมีย์กุล',
      userCid: '3320500282121',
      hospitalCode: '10670',
      hospitalName: 'รพ.ทดสอบ',
      role: 'NURSE',
    },
  }),
}));

// The single MOPH LINE switch became a per-hospital, per-event card
// (spec 2026-08-07-notification-events-design), so the page-level assertion is
// now "one event checkbox, and it flips" rather than "one switch".
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
  ],
  preferences: [
    {
      id: 'p1',
      userCid: '3320500282121',
      hospitalCode: '10670',
      mophLineEnabled: false,
      detailLevel: 'full',
      digestHour: 8,
      events: [],
    },
  ],
};

const fetched = vi.fn(async (_url: string, init?: { method?: string }) => ({
  ok: true,
  async json() {
    if (!init || init.method === undefined) return GET_BODY;
    return { ...GET_BODY.preferences[0], mophLineEnabled: true, events: ['anc_hr3'] };
  },
}));
vi.stubGlobal('fetch', fetched);

describe('profile notification page', () => {
  it('renders masked identity + event checkbox and flips on click', async () => {
    // react-dom/client does not resolve async function components; the page is
    // a server component, so render the awaited element (same assertions as if
    // React pumped the promise — masked CID regex + checkbox flip).
    render(await ProfilePage());
    // masked CID: first char + 8 X + last 4
    await screen.findByText(/3X{8}2121/);
    const anc = await screen.findByRole('checkbox', { name: /ANC HR3/ });
    expect(anc).not.toBeChecked();
    await userEvent.click(anc);
    await waitFor(() => expect(anc).toBeChecked());
  });
});

describe('profile page layout (sub-project 5)', () => {
  it('uses the shared page header; identity is masked inside a section card; no nested main', async () => {
    const { container } = render(await ProfilePage());
    expect(screen.getByRole('heading', { level: 1, name: 'โปรไฟล์และการแจ้งเตือน' })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'ข้อมูลผู้ใช้' });
    expect(within(card).getByText('นาย ชัยพร ส.')).toBeInTheDocument();
    expect(within(card).getByText(/3X{8}2121/)).toBeInTheDocument();
    expect(within(card).queryByText('3320500282121')).toBeNull();
    expect(container.querySelector('main')).toBeNull();
  });
});
