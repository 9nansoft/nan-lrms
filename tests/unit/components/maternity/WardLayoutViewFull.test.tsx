// tests/unit/components/maternity/WardLayoutViewFull.test.tsx
/* @vitest-environment jsdom */
// Fix wave (sub-project 3): I2 patient visibility, unique test ids and
// keyboard access on the ward board. Every admitted patient must be on screen —
// on her bed, on a shared bed, or in the "unplaced" section.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WardLayoutViewFull } from '@/components/maternity/WardLayoutViewFull';
import { summarizeBeds } from '@/services/ward-board';
import { HOUR, localParts, makeBed, makeOccupant, wardScenario } from '../../../helpers/ward-fixtures';

const NOW = new Date('2026-04-19T14:00:00').getTime();
const s = wardScenario(NOW);

const occ = (an: string, bedno: string, fname: string, hoursAgo = 2, cx: number | null = 5) => {
  const p = localParts(NOW, hoursAgo * HOUR);
  return makeOccupant({ an, bedno, roomno: 'LR1', fname, regdate: p.date, regtime: p.time, last_cervix_cm: cx });
};

describe('WardLayoutViewFull — I2 every admitted patient is visible', () => {
  const unplaced = [occ('AN-NOBED', '', 'บุษบา'), occ('AN-OFF', '99', 'จันทร์เพ็ญ')];

  it('patients with a blank bed or a bed outside the layout get their own section with a count', () => {
    render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy, ...unplaced]} now={NOW} />);
    const section = screen.getByRole('region', { name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' });
    expect(within(section).getByRole('heading', { level: 2, name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' })).toBeInTheDocument();
    expect(section).toHaveTextContent('ผู้คลอด 2 รายรับไว้ในวอร์ดนี้แต่ไม่มีเตียงในผัง');
    // Masked exactly like the bed tiles; the full surname never renders.
    expect(within(section).getByText(/บุษบา ท\./)).toBeInTheDocument();
    expect(within(section).getByText(/จันทร์เพ็ญ ท\./)).toBeInTheDocument();
    expect(screen.queryByText(/บุษบา ทดสอบ/)).toBeNull();
    expect(within(section).getByText('ยังไม่ได้จัดเตียง')).toBeInTheDocument();
    expect(within(section).getByText('เตียง 99 · ไม่อยู่ในผังวอร์ดนี้')).toBeInTheDocument();
  });

  it('no unplaced patients → no section', () => {
    render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    expect(screen.queryByRole('region', { name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' })).toBeNull();
  });

  it('an unplaced patient opens like any bed tile', () => {
    const onBedClick = vi.fn();
    render(
      <WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy, ...unplaced]} now={NOW} onBedClick={onBedClick} />,
    );
    fireEvent.click(screen.getByText(/จันทร์เพ็ญ ท\./));
    expect(onBedClick).toHaveBeenCalledWith('AN-OFF');
  });

  it('two admissions on one bed: both patients are shown with a conflict notice; room header agrees', () => {
    const second = occ('AN-SHARED', '02', 'สมศรี');
    const onBedClick = vi.fn();
    const { container } = render(
      <WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy, second]} now={NOW} onBedClick={onBedClick} />,
    );
    const slot = container.querySelector<HTMLElement>('[data-testid="bed-slot-02"]')!;
    expect(within(slot).getByText(/อรุณี ท\./)).toBeInTheDocument();
    expect(within(slot).getByText(/สมศรี ท\./)).toBeInTheDocument();
    expect(within(slot).getByTestId('bed-conflict-02')).toHaveTextContent(
      'เตียงซ้อน: 2 รายบนเตียง 02 ใน HOSxP — ตรวจและแก้เตียงใน HOSxP',
    );
    fireEvent.click(within(slot).getByText(/สมศรี ท\./));
    expect(onBedClick).toHaveBeenCalledWith('AN-SHARED');
    // LR1 had 3 patients on 5 beds; now 4 patients, still 3 occupied beds → 2 free.
    expect(screen.getByText('5 เตียง · มีผู้คลอด 4 · ว่าง 2 · เตียงซ้อน 1')).toBeInTheDocument();
    // A shared bed is not draggable: which admission would move is ambiguous.
    expect(slot.getAttribute('aria-disabled')).toBe('true');
  });

  it('room headers plus the unplaced section add up to the ward count (one counting rule)', () => {
    const all = [...s.occupancy, occ('AN-SHARED', '02', 'สมศรี'), ...unplaced];
    render(<WardLayoutViewFull beds={[...s.beds]} occupancy={all} now={NOW} />);
    const ward = summarizeBeds([...s.beds], all, NOW);
    const roomPatients = [...document.querySelectorAll('section[data-testid^="ward-room-"] > header > p')].map((p) =>
      Number(/มีผู้คลอด (\d+)/.exec(p.textContent ?? '')?.[1]),
    );
    expect(roomPatients.reduce((a, b) => a + b, 0) + ward.unplaced).toBe(ward.patients);
    expect(ward.patients).toBe(7);
  });
});

describe('WardLayoutViewFull — test ids and keyboard', () => {
  it('each bed test id is unique: the drag wrapper is bed-slot-<n>, the tile is bed-<n>', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    for (const b of s.expected.order) {
      expect(container.querySelectorAll(`[data-testid="bed-${b}"]`)).toHaveLength(1);
      expect(container.querySelector(`[data-testid="bed-${b}"]`)!.tagName).toBe('ARTICLE');
      expect(container.querySelectorAll(`[data-testid="bed-slot-${b}"]`)).toHaveLength(1);
    }
  });

  it.each(['Enter', ' '])('an occupied tile is a focusable button that opens on %j', (key) => {
    const onBedClick = vi.fn();
    const { container } = render(
      <WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} onBedClick={onBedClick} />,
    );
    const tile = container.querySelector<HTMLElement>('article[data-testid="bed-02"]')!;
    expect(tile.getAttribute('role')).toBe('button');
    expect(tile.tabIndex).toBe(0);
    expect(tile.getAttribute('aria-label')).toBe('เตียง 02 · นาง อรุณี ท. — เปิดรายละเอียดผู้คลอด');
    fireEvent.keyDown(tile, { key });
    expect(onBedClick).toHaveBeenCalledWith('AN-ACT');
  });

  it('vacant tiles are not buttons', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    expect(container.querySelector('article[data-testid="bed-03"]')!.getAttribute('role')).toBeNull();
  });

  it('a bed whose only patient is unplaced elsewhere stays a free bed', () => {
    const beds = [makeBed('01', 'LR1', 1)];
    render(<WardLayoutViewFull beds={beds} occupancy={[occ('AN-OFF', '99', 'จันทร์เพ็ญ')]} now={NOW} />);
    expect(screen.getByText('1 เตียง · มีผู้คลอด 0 · ว่าง 1')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'ยังไม่ได้จัดเตียง / ไม่ตรงผังเตียง' })).toBeInTheDocument();
  });

  it('vacant and locked slots sit at the top of their grid row instead of stretching to the occupied tiles', () => {
    const { container } = render(<WardLayoutViewFull beds={[...s.beds]} occupancy={[...s.occupancy]} now={NOW} />);
    const slot = (b: string) => container.querySelector<HTMLElement>(`div[data-testid="bed-slot-${b}"]`)!;
    for (const b of ['03', '05', '07', '08', '09']) expect(slot(b).className).toContain('self-start');
    for (const b of ['01', '02', '04', '06']) expect(slot(b).className).not.toContain('self-start');
    // Still a drop target: dnd-kit enrols every slot, empty ones included.
    expect(slot('03').getAttribute('aria-disabled')).toBe('true');
  });
});
