// tests/unit/components/maternity/ward-board.characterization.test.tsx
/* @vitest-environment jsdom */
// Characterization of the ward board BEFORE the sub-project 3 restyle
// (docs/superpowers/specs/2026-10-11-ui-ward-design.md).
//  - Behaviour assertions (order, test ids, callbacks, counts, masking,
//    maternal-screen lookup) stay green and UNEDITED through Task 8.
//  - Copy lives only in COPY; Task 5 changes COPY values and nothing else.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WardLayoutViewFull } from '@/components/maternity/WardLayoutViewFull';
import { BedTileFull } from '@/components/maternity/BedTileFull';
import type { MaternalScreenSummaryItem } from '@/types/api';
import { HOUR, localParts, makeOccupant, wardScenario } from '../../../helpers/ward-fixtures';

const COPY = {
  stage: {
    prolongedLatent: 'ระยะแฝงนาน · ประเมินด่วน',
    // Fix wave minor 7: same rule and alarm, but the label names the missing record.
    prolongedLatentNoCervix: 'ยังไม่มีบันทึกปากมดลูก ≥12 ชม.',
    transition: 'ระยะที่ 1 · ระยะเปลี่ยนผ่าน',
    active: 'ระยะที่ 1 · ระยะเร่ง',
    latent: 'ระยะที่ 1 · ระยะแฝง',
  },
  roomCode: (roomno: string) => `รหัสห้อง ${roomno}`,
  roomSummary: (r: { total: number; occupied: number; free: number; locked: number }) =>
    `${r.total} เตียง · มีผู้คลอด ${r.occupied} · ว่าง ${r.free}${r.locked > 0 ? ` · ปิดใช้งาน ${r.locked}` : ''}`,
  emptyBody: 'ว่าง',
  lockedBody: 'ปิดบำรุง',
};

const NOW = new Date('2026-04-19T14:00:00').getTime();
const s = wardScenario(NOW);

const articles = (c: HTMLElement) =>
  Array.from(c.querySelectorAll<HTMLElement>('article[data-testid^="bed-"]'));

describe('WardLayoutViewFull — characterization', () => {
  it('orders rooms by display number, beds by bed_order (nulls last) then bedno', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    expect(articles(container).map((a) => a.dataset.testid)).toEqual(s.expected.order.map((b) => `bed-${b}`));
  });

  it('renders each room with its code, name and bed counts', () => {
    render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    for (const [roomno, r] of Object.entries(s.expected.rooms)) {
      expect(screen.getByText(COPY.roomCode(roomno))).toBeInTheDocument();
      expect(screen.getByText(r.name)).toBeInTheDocument();
      expect(screen.getByText(COPY.roomSummary(r))).toBeInTheDocument();
    }
  });

  it('renders empty, locked and occupied variants; patient names are masked', () => {
    render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    expect(screen.getAllByText(COPY.emptyBody)).toHaveLength(s.expected.free);
    expect(screen.getAllByText(COPY.lockedBody)).toHaveLength(s.expected.locked);
    for (const o of s.occupancy) {
      expect(screen.getByText(new RegExp(`${o.fname} ท\\.`))).toBeInTheDocument();
      expect(screen.queryByText(new RegExp(`${o.fname} ทดสอบ`))).toBeNull();
    }
  });

  it('clicking an occupied tile reports that patient AN', () => {
    const onBedClick = vi.fn();
    const { container } = render(
      <WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} onBedClick={onBedClick} />,
    );
    fireEvent.click(container.querySelector('article[data-testid="bed-02"]')!);
    expect(onBedClick).toHaveBeenCalledWith('AN-ACT');
  });

  it('rooms are labelled sections on a 320px-min grid; every tile carries data-stage', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    const room = container.querySelector<HTMLElement>('[data-testid="ward-room-LR1"]')!;
    expect(room.tagName).toBe('SECTION');
    expect(within(room).getByRole('heading', { level: 2, name: 'ห้องรอคลอด 1' })).toBeInTheDocument();
    expect(within(room).getByTestId('ward-room-grid').className).toContain(
      'grid-cols-[repeat(auto-fill,minmax(320px,1fr))]',
    );
    expect(articles(container).every((a) => Boolean(a.dataset.stage))).toBe(true);
  });

  it('only occupied beds are draggable', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    // Fix wave: the drag wrapper's id is bed-slot-<n> so bed-<n> is unique to the tile.
    const wrapper = (b: string) => container.querySelector<HTMLElement>(`div[data-testid="bed-slot-${b}"]`)!;
    expect(wrapper('02').getAttribute('aria-disabled')).toBe('false');
    expect(wrapper('03').getAttribute('aria-disabled')).toBe('true');
  });

  it('looks maternal-screen summaries up by AN; other tiles render zero DOM', () => {
    const summaries = new Map<string, MaternalScreenSummaryItem>([
      ['AN-ACT', { an: 'AN-ACT', localTier: 'LOCAL_SEVERE', emergencyAcuity: null, isComplete: true, assessedAt: null }],
    ]);
    const { container } = render(
      <WardLayoutViewFull
        beds={[...s.beds]}
        occupancy={[...s.occupancy]}
        now={NOW}
        maternalScreenSummaries={summaries}
      />,
    );
    const tile = container.querySelector<HTMLElement>('article[data-testid="bed-02"]')!;
    expect(within(tile).getByTestId('bed-maternal-screen')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="bed-maternal-screen"]')).toHaveLength(1);
  });
});

describe('BedTileFull — stage classification (characterization)', () => {
  const at = (hoursAgo: number, cx: number | null) => {
    const p = localParts(NOW, hoursAgo * HOUR);
    return makeOccupant({ an: 'AN-X', bedno: '01', roomno: 'LR1', regdate: p.date, regtime: p.time, last_cervix_cm: cx });
  };

  it.each([
    ['12 h, Cx unknown', 12, null, 'prolongedLatentNoCervix'],
    ['12 h, Cx 3.9', 12, 3.9, 'prolongedLatent'],
    ['11 h 59 min, Cx unknown', 12 - 1 / 60, null, 'latent'],
    ['12 h, Cx 4', 12, 4, 'active'],
    ['4 h, Cx 3.9', 4, 3.9, 'latent'],
    ['4 h, Cx 4', 4, 4, 'active'],
    ['4 h, Cx 6.5', 4, 6.5, 'active'],
    ['4 h, Cx 7', 4, 7, 'transition'],
    ['20 h, Cx 9', 20, 9, 'transition'],
  ] as const)('%s → %s', (_name, hours, cx, kind) => {
    render(<BedTileFull bedno="01" bedLock="N" occupant={at(hours, cx)} now={NOW} />);
    expect(screen.getByText(COPY.stage[kind])).toBeInTheDocument();
  });
});
