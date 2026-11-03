/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// Task 25: full-render integration test for the hospital maternity-ward page.
// Wraps the (hospital) layout around the page, mocks next-auth + next/navigation
// so the layout renders synchronously, and mocks the maternity-ward domain
// service so the SWR hook resolves with deterministic data. Verifies:
//   1. Without a BMS session, the prompt renders.
//   2. With a session + ward/inventory/occupancy data, the header summary,
//      room sections, and refresh button render.
//   3. When the ward query fails, the error UI surfaces.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import HospitalLayout from '@/app/(hospital)/layout';
import HospitalMaternityWardPage from '@/app/(hospital)/hospital-maternity-ward/page';
import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
  useSession: () => ({
    data: {
      user: {
        id: 'u1',
        name: 'นางทดสอบ',
        role: 'NURSE',
        hospitalCode: '10670',
        hospitalName: 'รพ.น่าน',
        tunnelUrl: '',
        databaseType: 'mysql',
      },
    },
  }),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/hospital-maternity-ward',
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, prefetch: () => {} }),
}));

vi.mock('@/services/maternity-ward', () => ({
  listMaternityWards: vi.fn(),
  listWardBedsInventory: vi.fn(),
  // The redesigned page reads occupancy through useMaternityWardStateFull, which
  // calls listWardBedsOccupancyFull (the clinical-density query). The lite
  // listWardBedsOccupancy is kept mocked too so any stray import stays safe.
  listWardBedsOccupancy: vi.fn(),
  listWardBedsOccupancyFull: vi.fn(),
  // Task 51-52: page now lazy-loads bed-move reasons and triggers movePatientBed
  // on drag-drop confirm. Stub both with safe defaults so the page render path
  // is independent of these flows in this test.
  getBedMoveReasons: vi.fn().mockResolvedValue([]),
  movePatientBed: vi.fn().mockResolvedValue(undefined),
}));

import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancyFull,
} from '@/services/maternity-ward';
import { makeBed, makeOccupant, wardScenario } from '../helpers/ward-fixtures';
import { newbornsInWardNotice } from '@/config/ward-display';
const mockListWards = listMaternityWards as unknown as ReturnType<typeof vi.fn>;
const mockListInventory = listWardBedsInventory as unknown as ReturnType<typeof vi.fn>;
const mockListOccupancyFull = listWardBedsOccupancyFull as unknown as ReturnType<typeof vi.fn>;

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// PasteJSON (session-retrieval) response for the current test. Every other
// fetch — the AppShell presence heartbeat (fires because the mocked session
// carries a userId) and any skipped onboarding/poll calls — routes to a benign
// 200 so sendHeartbeat's `fetch(...).catch()` always has a real promise.
let sessionResolver: () => Promise<unknown>;

function benignResponse(): Promise<unknown> {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({}),
    text: async () => '',
    clone() {
      return this;
    },
  });
}

const PAGE = (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    <HospitalLayout>
      <HospitalMaternityWardPage />
    </HospitalLayout>
  </SWRConfig>
);

beforeEach(() => {
  mockFetch.mockReset();
  sessionResolver = benignResponse;
  mockFetch.mockImplementation((input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url.startsWith('https://hosxp.net/phapi/PasteJSON')) {
      return sessionResolver();
    }
    return benignResponse();
  });
  mockListWards.mockReset();
  mockListInventory.mockReset();
  mockListOccupancyFull.mockReset();
  document.cookie = 'bms-session-id=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  document.cookie = 'marketplace_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
  localStorage.clear();
  window.history.replaceState({}, '', 'http://localhost/');
});

describe('Hospital maternity ward page (full render)', () => {
  it('shows BMS session prompt when no session', async () => {
    render(PAGE);
    expect(await screen.findByText(/เปิดหน้านี้จาก HOSxP/)).toBeInTheDocument();
  });

  it('renders header summary + 4 bed tiles when session resolves', async () => {
    sessionResolver = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          jwt: 'JWT',
          bms_url: 'https://t.example/api',
          user_info: { loginname: 'nurse1', fullname: 'Nurse One', hospcode: '10670' },
        }),
      });
    mockListWards.mockResolvedValue([{ ward: '03', name: 'ห้องคลอด', real_bedcount: 4 }]);
    mockListInventory.mockResolvedValue([
      {
        bedno: '01',
        roomno: 'LR1',
        bed_order: 1,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR1',
        room_display_number: 1,
      },
      {
        bedno: '02',
        roomno: 'LR1',
        bed_order: 2,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR1',
        room_display_number: 1,
      },
      {
        bedno: '03',
        roomno: 'LR2',
        bed_order: 1,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR2',
        room_display_number: 2,
      },
      {
        bedno: '04',
        roomno: 'LR2',
        bed_order: 2,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR2',
        room_display_number: 2,
      },
    ]);
    mockListOccupancyFull.mockResolvedValue([
      {
        an: 'AN1',
        hn: 'HN1',
        regdate: '2026-04-19',
        regtime: '10:00',
        ward: '03',
        bedno: '01',
        roomno: 'LR1',
        bedtype: null,
        roomname: 'LR1',
        pname: 'นาง',
        fname: 'A',
        lname: '',
        birthday: '1996-04-19',
        gravida: 2,
        ga: 38,
        incharge_doctor_name: 'ดร.X',
        last_observation_at: null,
        last_cervix_cm: 4,
      },
    ]);
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=SID');

    render(PAGE);

    // Wait for the full data roundtrip: the (masked) occupant only renders once
    // wards + inventory + occupancy-full have all resolved and the dense tile
    // mounts into bed 01.
    await waitFor(() => expect(screen.getByText(/นาง A/)).toBeInTheDocument(), {
      timeout: 2000,
    });
    // Masthead heading (the h1 carries a trailing accent "." span).
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('ห้องคลอด');
    // KPI masthead summary — Total Beds / Occupied are unique to the masthead
    // (the "Available" label collides with the empty-tile status pill).
    expect(
      within(screen.getByRole('region', { name: 'สรุปเตียงในห้องคลอด' })).getByText('เตียงทั้งหมด'),
    ).toBeInTheDocument();
    // Both rooms render (room_name from the bedno inventory).
    expect(screen.getByText('LR1')).toBeInTheDocument();
    expect(screen.getByText('LR2')).toBeInTheDocument();
    // One occupied + three empty beds (the tiles; the summary legend also reads "ว่าง").
    const tiles = [...document.querySelectorAll<HTMLElement>('article[data-testid^="bed-"]')];
    expect(tiles.flatMap((t) => within(t).queryAllByText('ว่าง')).length).toBe(3);
    // Refresh control (redesign labels it "Refresh ↻").
    expect(screen.getByRole('button', { name: /รีเฟรช/ })).toBeInTheDocument();
  });

  it('clicks bed → opens drawer with patient header + tabs', async () => {
    sessionResolver = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          jwt: 'JWT',
          bms_url: 'https://t.example/api',
          user_info: { loginname: 'nurse1', fullname: 'Nurse One', hospcode: '10670' },
        }),
      });
    mockListWards.mockResolvedValue([{ ward: '03', name: 'ห้องคลอด', real_bedcount: 4 }]);
    mockListInventory.mockResolvedValue([
      {
        bedno: '01',
        roomno: 'LR1',
        bed_order: 1,
        bed_lock: 'N',
        bed_status_type_id: 1,
        room_name: 'LR1',
        room_display_number: 1,
      },
    ]);
    mockListOccupancyFull.mockResolvedValue([
      {
        an: 'AN1',
        hn: 'HN1',
        regdate: '2026-04-19',
        regtime: '10:00',
        ward: '03',
        bedno: '01',
        roomno: 'LR1',
        bedtype: null,
        roomname: 'LR1',
        pname: 'นาง',
        fname: 'A',
        lname: '',
        birthday: '1996-04-19',
        gravida: 2,
        ga: 38,
        incharge_doctor_name: 'ดร.X',
        last_observation_at: null,
        last_cervix_cm: 4,
      },
    ]);
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=SID');

    render(PAGE);
    // The dense BedTileFull renders identity/vitals but carries no "เตียง NN"
    // aria-label — the whole <article> is the click target (onClick → onBedClick).
    // Click via the masked patient name, which sits inside the occupied tile so
    // the click bubbles to the article's handler.
    await waitFor(() => expect(screen.getByText(/นาง A/)).toBeInTheDocument(), {
      timeout: 2000,
    });
    fireEvent.click(screen.getByText(/นาง A/));

    // Drawer opens (role="dialog") with the patient's AN in the header + 10 tabs.
    // AN also appears on the tile, so assert the drawer itself, not a bare /AN1/.
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument(), {
      timeout: 2000,
    });
    expect(screen.getByText('AN AN1')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'พาร์โทกราฟ' })).toBeInTheDocument();
  });

  it('shows error UI when ward query fails', async () => {
    sessionResolver = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          jwt: 'JWT',
          bms_url: 'https://t.example/api',
          user_info: { loginname: 'n1', fullname: 'N', hospcode: '10670' },
        }),
      });
    mockListWards.mockRejectedValue(new Error('BMS unavailable'));
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=X');

    render(PAGE);
    await waitFor(
      () => expect(screen.getByText(/ไม่สามารถโหลดข้อมูลห้องคลอด/)).toBeInTheDocument(),
      { timeout: 2000 },
    );
  });
});

// ─── Characterization (sub-project 3, Task 1) ──────────────────────────────
// Behaviour assertions below stay UNEDITED through Task 8; Task 4 changes
// PAGE_COPY values only.
const PAGE_COPY = {
  kpiRegion: () => screen.getByRole('region', { name: 'สรุปเตียงในห้องคลอด' }),
  kpiLabels: ['เตียงทั้งหมด', 'มีผู้คลอด', 'ว่าง', 'ปิด', 'ระยะแฝงนาน'],
  refreshButton: /รีเฟรช/,
  noWards: 'ไม่พบห้องคลอดใน HOSxP',
};
const num = (n: number) => new RegExp(`^0?${n}$`);

function openSession() {
  sessionResolver = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({
        jwt: 'JWT',
        bms_url: 'https://t.example/api',
        user_info: { loginname: 'nurse1', fullname: 'Nurse One', hospcode: '10670' },
      }),
    });
  window.history.replaceState({}, '', 'http://localhost/?bms-session-id=SID');
}

describe('Hospital maternity ward page — characterization', () => {
  it('KPI masthead counts the whole ward roster', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
    render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    const region = PAGE_COPY.kpiRegion();
    for (const label of PAGE_COPY.kpiLabels)
      expect(within(region).getByText(label)).toBeInTheDocument();
    const e = s.expected;
    for (const n of [e.totalBeds, e.occupied, e.free, e.locked, e.prolongedLatent]) {
      expect(within(region).getByText(num(n))).toBeInTheDocument();
    }
    expect(within(region).getByText(/44%/)).toBeInTheDocument(); // 4 of 9 beds
  });

  it('newborns admitted onto labour-ward beds are not counted, and staff are told to fix the bed', async () => {
    // HOSxP admit type 4 (แรกเกิด): one baby on her mother's bed (01), one on
    // an otherwise free bed (03). Neither is a labouring patient.
    const s = wardScenario(Date.now());
    const baby = (an: string, bedno: string) =>
      makeOccupant({
        an,
        bedno,
        roomno: 'LR1',
        pname: 'ด.ญ.',
        fname: `ทารก${bedno}`,
        ipt_admit_type_id: 4,
      });
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([
      ...s.occupancy,
      baby('AN-NB1', '01'),
      baby('AN-NB2', '03'),
    ]);
    render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });

    const region = PAGE_COPY.kpiRegion();
    const e = s.expected;
    for (const n of [e.totalBeds, e.occupied, e.free, e.locked, e.prolongedLatent]) {
      expect(within(region).getByText(num(n))).toBeInTheDocument();
    }
    expect(screen.queryByText(/เตียงซ้อน/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ทารก01/)).not.toBeInTheDocument();
    expect(screen.getByText(newbornsInWardNotice(['01', '03']))).toBeInTheDocument();
  });

  it('one freshness indicator: the ward update time rides in the live pill, not under the title', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
    render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    expect(screen.queryByText(/ข้อมูล HOSxP ณ/)).toBeNull();
    const pill = screen
      .getAllByRole('status')
      .find((el) => el.textContent?.startsWith('เชื่อมต่อ HOSxP สด'));
    expect(pill?.textContent).toMatch(/^เชื่อมต่อ HOSxP สด · อัปเดต \d{2}:\d{2}$/);
  });

  it('switching ward queries the chosen ward', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([
      ...s.wards,
      { ward: '05', name: 'ห้องคลอดสอง', real_bedcount: 1 },
    ]);
    mockListInventory.mockImplementation(async (_c: unknown, ward: string) =>
      ward === '05' ? [makeBed('11', 'LR9', 1)] : [...s.beds],
    );
    mockListOccupancyFull.mockImplementation(async (_c: unknown, ward: string) =>
      ward === '05' ? [] : [...s.occupancy],
    );
    const { container } = render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    fireEvent.change(screen.getByDisplayValue('ห้องคลอดทดสอบ (03)'), { target: { value: '05' } });
    await waitFor(
      () => expect(container.querySelector('article[data-testid="bed-11"]')).not.toBeNull(),
      {
        timeout: 2000,
      },
    );
    expect(mockListInventory).toHaveBeenCalledWith(expect.anything(), '05');
  });

  it('refresh re-reads occupancy from HOSxP', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
    render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    const before = mockListOccupancyFull.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: PAGE_COPY.refreshButton }));
    await waitFor(() => expect(mockListOccupancyFull.mock.calls.length).toBeGreaterThan(before));
  });

  // Some hospitals open only this page from HOSxP — never `/` — so the board
  // runs the same browser sync and exposes the same status + IT report.
  it('HOSxP → NN-LRMS sync: same status chip and diagnostics dialog as `/`', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
    render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    const chip = screen.getByRole('button', { name: /^ส่งข้อมูลเข้า NN-LRMS: / });
    fireEvent.click(chip);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('สถานะการดึงข้อมูลจาก HOSxP')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'คัดลอกรายงาน' })).toBeInTheDocument();
  });

  it('a hospital with no maternity ward gets an explanation', async () => {
    openSession();
    mockListWards.mockResolvedValue([]);
    render(PAGE);
    expect(
      await screen.findByText(PAGE_COPY.noWards, undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it('missing bms_url → actionable Thai session error with the raw text kept', async () => {
    sessionResolver = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ result: { user_info: { bms_session_code: 'B', hospcode: '10670' } } }),
      });
    window.history.replaceState({}, '', 'http://localhost/?bms-session-id=NOURL');
    render(PAGE);
    const alert = await screen.findByRole('alert', undefined, { timeout: 2000 });
    expect(alert).toHaveTextContent('เซสชัน HOSxP ไม่มีที่อยู่เซิร์ฟเวอร์ BMS ของโรงพยาบาล');
    expect(alert).toHaveTextContent('วิธีแก้:');
    expect(alert).toHaveTextContent('BMS session response missing bms_url');
  });

  it('a ward with no beds explains how to fix it', async () => {
    openSession();
    mockListWards.mockResolvedValue([{ ward: '03', name: 'ห้องคลอดทดสอบ', real_bedcount: 0 }]);
    mockListInventory.mockResolvedValue([]);
    mockListOccupancyFull.mockResolvedValue([]);
    render(PAGE);
    expect(
      await screen.findByText('วอร์ดนี้ยังไม่มีเตียงใน HOSxP', undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
  });

  it('zero occupants → EmptyState above a still-usable bed grid', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([]);
    const { container } = render(PAGE);
    expect(
      await screen.findByText('ไม่มีผู้คลอดในห้องคลอดขณะนี้', undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('เตียงว่าง 7 เตียง · ข้อมูล HOSxP อัปเดตทุก 20 วินาที'),
    ).toBeInTheDocument();
    expect(container.querySelectorAll('article[data-testid^="bed-"]')).toHaveLength(9);
  });
});

// ─── I2: a patient without a usable bed is never dropped ───────────────────
describe('Hospital maternity ward page — patients without a usable bed (I2)', () => {
  it('counts them in the KPI, lists them, opens them, and never claims the ward is empty', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    const nobed = { ...s.occupancy[0], an: 'AN-NOBED', bedno: '', fname: 'บุษบา' };
    mockListOccupancyFull.mockResolvedValue([nobed]);
    render(PAGE);
    const section = await screen.findByRole(
      'region',
      { name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' },
      { timeout: 2000 },
    );
    expect(within(section).getByText(/บุษบา ท\./)).toBeInTheDocument();
    const occupied = within(PAGE_COPY.kpiRegion()).getByTestId('ward-kpi-occupied');
    expect(occupied.querySelector('[data-kpi-value]')).toHaveTextContent(num(1));
    expect(PAGE_COPY.kpiRegion()).toHaveTextContent('ยังไม่ได้จัดเตียง 1');
    expect(screen.queryByText('ไม่มีผู้คลอดในห้องคลอดขณะนี้')).toBeNull();
    fireEvent.click(within(section).getByText(/บุษบา ท\./));
    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('AN AN-NOBED')).toBeInTheDocument();
  });

  it('a ward with no beds still lists admitted patients', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([]);
    mockListOccupancyFull.mockResolvedValue([{ ...s.occupancy[0], an: 'AN-X', bedno: '07' }]);
    render(PAGE);
    expect(
      await screen.findByText('วอร์ดนี้ยังไม่มีเตียงใน HOSxP', undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' }),
    ).toHaveTextContent('เตียง 07 · ไม่อยู่ในผังวอร์ดนี้');
  });
});

// ─── C1: "not loaded" / "failed" must never read as "empty" ────────────────
// A nurse must never be told the ward is empty (or that every bed is free)
// because a HOSxP feed is still loading or has failed.
const EMPTY_WARD_COPY = [
  'ไม่มีผู้คลอดในห้องคลอดขณะนี้',
  'วอร์ดนี้ยังไม่มีเตียงใน HOSxP',
  'พร้อมรับผู้คลอด',
  'ดึงข้อมูลเตียงจาก HOSxP ไม่สำเร็จ — แสดงข้อมูลเดิม',
];
function expectNoEmptyBoard(container: HTMLElement) {
  for (const copy of EMPTY_WARD_COPY) expect(screen.queryByText(copy)).toBeNull();
  expect(container.querySelectorAll('article[data-testid^="bed-"]')).toHaveLength(0);
  expect(screen.queryByRole('region', { name: 'สรุปเตียงในห้องคลอด' })).toBeNull();
}

describe('Hospital maternity ward page — load failures are not an empty ward (C1)', () => {
  it.each([
    ['occupancy', 'รายชื่อผู้คลอดบนเตียง'],
    ['beds', 'ผังเตียง'],
  ] as const)(
    'the %s feed failing on first load → full ErrorState, never "empty"',
    async (feed, label) => {
      const s = wardScenario(Date.now());
      openSession();
      mockListWards.mockResolvedValue([...s.wards]);
      if (feed === 'beds') {
        mockListInventory.mockRejectedValue(new Error('beds down'));
        mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
      } else {
        mockListInventory.mockResolvedValue([...s.beds]);
        mockListOccupancyFull.mockRejectedValue(new Error('occupancy down'));
      }
      const { container } = render(PAGE);
      const alert = await screen.findByText(
        new RegExp(`ไม่สามารถโหลดข้อมูลห้องคลอดจาก HOSxP — ${label}`),
        undefined,
        {
          timeout: 3000,
        },
      );
      expect(alert).toHaveTextContent(/ล้มเหลวตั้งแต่/);
      expect(screen.getByText(/อย่าถือว่าห้องคลอดว่าง/)).toBeInTheDocument();
      expect(screen.getByText(`${feed} down`)).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: /ลองใหม่/ }).length).toBeGreaterThan(0);
      expectNoEmptyBoard(container);
    },
  );

  it('the ward LIST failing on first load: "ลองใหม่" refetches the ward list and recovers', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockRejectedValueOnce(new Error('wards down')).mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull.mockResolvedValue([...s.occupancy]);
    render(PAGE);
    await screen.findByText('wards down', undefined, { timeout: 3000 });
    expect(mockListWards).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /ลองใหม่/ })[0]);
    expect(await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(mockListWards).toHaveBeenCalledTimes(2);
  });

  it('a refresh failing AFTER a good load keeps the last good board under a stale banner', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([...s.wards]);
    mockListInventory.mockResolvedValue([...s.beds]);
    mockListOccupancyFull
      .mockResolvedValueOnce([...s.occupancy])
      .mockRejectedValue(new Error('occupancy down'));
    const { container } = render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    fireEvent.click(screen.getByRole('button', { name: PAGE_COPY.refreshButton }));
    const banner = await screen.findByText(
      'ดึงข้อมูลเตียงจาก HOSxP ไม่สำเร็จ — แสดงข้อมูลเดิม',
      undefined,
      {
        timeout: 3000,
      },
    );
    const bannerEl = banner.closest<HTMLElement>('[role="alert"]')!;
    expect(bannerEl).toHaveTextContent(/แสดงข้อมูลล่าสุดเมื่อ/);
    expect(within(bannerEl).getByText('ลองใหม่').closest('button')).not.toBeNull();
    expect(container.querySelectorAll('article[data-testid^="bed-"]')).toHaveLength(9);
    expect(screen.getByText(/ลัดดา ท\./)).toBeInTheDocument();
    expect(screen.queryByText('ไม่มีผู้คลอดในห้องคลอดขณะนี้')).toBeNull();
  });

  it.each([
    ['occupancy', 'beds resolved'],
    ['beds', 'occupancy resolved'],
  ] as const)(
    'first load: %s still in flight (%s) → LoadingState, no empty-ward copy',
    async (pending, _settled) => {
      const s = wardScenario(Date.now());
      openSession();
      mockListWards.mockResolvedValue([...s.wards]);
      const never = () => new Promise(() => {});
      if (pending === 'occupancy') {
        mockListInventory.mockResolvedValue([...s.beds]);
        mockListOccupancyFull.mockImplementation(never);
      } else {
        mockListInventory.mockImplementation(never);
        mockListOccupancyFull.mockResolvedValue([]);
      }
      const { container } = render(PAGE);
      // The ward resolved (masthead + ward picker are up) and the other feed has
      // settled, so a wrongly rendered empty board would be on screen by now.
      await screen.findByRole('heading', { level: 1, name: /ห้องคลอด/ }, { timeout: 2000 });
      await waitFor(() => expect(mockListOccupancyFull).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.getByText('กำลังโหลดข้อมูลเตียงจาก HOSxP…')).toBeInTheDocument();
      expectNoEmptyBoard(container);
    },
  );

  it('switching ward shows LoadingState until the new ward loads — no stale board, no stale banner', async () => {
    const s = wardScenario(Date.now());
    openSession();
    mockListWards.mockResolvedValue([
      ...s.wards,
      { ward: '05', name: 'ห้องคลอดสอง', real_bedcount: 1 },
    ]);
    mockListInventory.mockImplementation(async (_c: unknown, ward: string) =>
      ward === '05' ? [makeBed('11', 'LR9', 1)] : [...s.beds],
    );
    mockListOccupancyFull.mockImplementation((_c: unknown, ward: string) =>
      ward === '05' ? new Promise(() => {}) : Promise.resolve([...s.occupancy]),
    );
    const { container } = render(PAGE);
    await screen.findByText(/ลัดดา ท\./, undefined, { timeout: 2000 });
    fireEvent.change(screen.getByDisplayValue('ห้องคลอดทดสอบ (03)'), { target: { value: '05' } });
    expect(
      await screen.findByText('กำลังโหลดข้อมูลเตียงจาก HOSxP…', undefined, { timeout: 2000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(mockListInventory).toHaveBeenCalledWith(expect.anything(), '05'));
    await new Promise((r) => setTimeout(r, 50));
    expectNoEmptyBoard(container);
    expect(screen.queryByText(/ลัดดา ท\./)).toBeNull();
    // The ward picker stays usable while the new ward loads.
    expect(screen.getByDisplayValue('ห้องคลอดสอง (05)')).toBeInTheDocument();
  });
});
