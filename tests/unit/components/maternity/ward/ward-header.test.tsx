// tests/unit/components/maternity/ward/ward-header.test.tsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WardHeaderActions } from '@/components/maternity/ward/WardHeaderActions';
import { WardKpis } from '@/components/maternity/ward/WardKpis';
import type { BedSummary } from '@/services/ward-board';

const one = [{ ward: '03', name: 'ห้องคลอด', real_bedcount: 9 }];
const two = [...one, { ward: '05', name: 'ห้องคลอดสอง', real_bedcount: 2 }];

describe('WardHeaderActions', () => {
  const base = {
    selectedWard: '03',
    onSelectWard: vi.fn(),
    onRefresh: vi.fn(),
    hosxpStatus: 'RUNNING' as const,
    hosxpDetail: 'scheduled · 2/3 cycles',
    onOpenHosxp: vi.fn(),
    syncing: false,
  };

  // Hospitals that only open this page sync to the province from here, so
  // the board shows the same sync status `/` does and opens the same dialog.
  it('shows the NN-LRMS sync status (same chip as `/`); clicking opens the diagnostics', () => {
    render(<WardHeaderActions {...base} wards={one} health="ok" />);
    const chip = screen.getByRole('button', { name: 'ส่งข้อมูลเข้า NN-LRMS: ทำงานอยู่' });
    expect(chip).toHaveAttribute('title', 'scheduled · 2/3 cycles');
    fireEvent.click(chip);
    expect(base.onOpenHosxp).toHaveBeenCalled();
  });

  it('refresh spins while a sync cycle runs but stays usable (the board refetch is independent)', () => {
    render(<WardHeaderActions {...base} wards={one} health="ok" syncing />);
    const refresh = screen.getByRole('button', { name: 'รีเฟรชข้อมูลเตียง' });
    expect(refresh).toBeEnabled();
    expect(refresh).toHaveAttribute('aria-busy', 'true');
    expect(refresh.querySelector('svg')!.getAttribute('class')).toContain('animate-spin');
  });

  it('hides the ward picker for a single ward; refresh is a named button', () => {
    render(<WardHeaderActions {...base} wards={one} health="ok" />);
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'รีเฟรชข้อมูลเตียง' }));
    expect(base.onRefresh).toHaveBeenCalled();
  });

  it('switches ward through the picker, options read "{name} ({ward})"', () => {
    render(<WardHeaderActions {...base} wards={two} health="ok" />);
    const picker = screen.getByRole('combobox');
    expect(within(picker).getByRole('option', { name: 'ห้องคลอดสอง (05)' })).toBeInTheDocument();
    fireEvent.change(picker, { target: { value: '05' } });
    expect(base.onSelectWard).toHaveBeenCalledWith('05');
  });

  it.each([
    ['ok', 'เชื่อมต่อ HOSxP สด', 'ok'],
    ['reconnecting', 'กำลังเชื่อมต่อ HOSxP ใหม่…', 'warn'],
    ['error', 'ขาดการเชื่อมต่อ HOSxP', 'danger'],
  ] as const)(
    'feed %s → "%s" (%s); the raw error is a tooltip only when unhealthy',
    (health, label, tone) => {
      render(
        <WardHeaderActions {...base} wards={one} health={health} errorMessage="BMS unavailable" />,
      );
      const chip = screen.getByRole('status');
      expect(chip).toHaveTextContent(label);
      expect(chip).toHaveAttribute('data-tone', tone);
      if (health === 'ok') expect(chip).not.toHaveAttribute('title');
      else expect(chip).toHaveAttribute('title', 'BMS unavailable');
    },
  );

  it('the live pill carries the ward’s own update time — the page’s single freshness indicator', () => {
    const { rerender } = render(
      <WardHeaderActions
        {...base}
        wards={one}
        health="ok"
        lastUpdatedAt="2026-10-12T03:32:00.000Z"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^เชื่อมต่อ HOSxP สด · อัปเดต 10:32$/);
    // Visible, but not re-announced by screen readers on every refresh.
    expect(screen.getByText('อัปเดต 10:32')).toHaveAttribute('aria-live', 'off');
    rerender(<WardHeaderActions {...base} wards={one} health="ok" lastUpdatedAt={null} />);
    expect(screen.getByRole('status')).toHaveTextContent(/^เชื่อมต่อ HOSxP สด$/);
  });
});

describe('WardKpis — capacity + urgent panels', () => {
  const summary: BedSummary = {
    totalBeds: 9,
    occupied: 4,
    patients: 4,
    unplaced: 0,
    sharedBeds: 0,
    free: 3,
    lockedEmpty: 2,
    lockedOccupied: 0,
    prolongedLatent: 1,
    occupancyPct: 44,
  };
  const value = (id: string) =>
    screen.getByTestId(`ward-kpi-${id}`).querySelector('[data-kpi-value]');

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('is one labelled region holding two panels that sit side by side only when the container is wide', () => {
    render(<WardKpis summary={summary} />);
    const region = screen.getByRole('region', { name: 'สรุปเตียงในห้องคลอด' });
    expect(region.className).toContain('@container');
    const capacity = within(region).getByRole('region', { name: 'ความจุเตียง' });
    const urgent = within(region).getByRole('region', { name: 'ต้องประเมินด่วน' });
    const grid = capacity.parentElement!;
    expect(grid).toBe(urgent.parentElement);
    expect(grid.className).toMatch(/@xl:grid-cols-/);
    expect(grid.className).not.toMatch(/(^|\s)grid-cols-/); // stacked by default
  });

  it('capacity: "ใช้เตียง N%" in the header and a bed bar whose segments sum to the bed count', () => {
    render(<WardKpis summary={summary} />);
    const capacity = screen.getByRole('region', { name: 'ความจุเตียง' });
    expect(within(capacity).getByText('ใช้เตียง 44%')).toBeInTheDocument();
    const bar = within(capacity).getByRole('img');
    expect(bar).toHaveAttribute(
      'aria-label',
      'เตียงทั้งหมด 9 เตียง: มีผู้คลอด 4 เตียง, ว่าง 3 เตียง, ปิด 2 เตียง',
    );
    const segs = [...bar.querySelectorAll<HTMLElement>('[data-segment]')];
    expect(segs.map((el) => [el.dataset.segment, Number(el.style.flexGrow)])).toEqual([
      ['occupied', 4],
      ['free', 3],
      ['locked', 2],
    ]);
    expect(segs.reduce((n, el) => n + Number(el.style.flexGrow), 0)).toBe(summary.totalBeds);
    expect(segs[0].className).toContain('bg-brand');
    expect(segs[1].className).toContain('bg-ok-tint');
    expect(segs[1].className).toContain('border-ok/40');
    expect(segs[2].className).toContain('bg-hatch-neutral');
  });

  it('a zero segment is not drawn', () => {
    render(<WardKpis summary={{ ...summary, lockedEmpty: 0, free: 5 }} />);
    const segs = [...screen.getByRole('img').querySelectorAll<HTMLElement>('[data-segment]')];
    expect(segs.map((el) => el.dataset.segment)).toEqual(['occupied', 'free']);
  });

  it('legend + footer carry the existing test ids with exact numbers; units say beds vs patients', () => {
    render(<WardKpis summary={summary} />);
    expect(screen.getByTestId('ward-kpi-occupied')).toHaveTextContent('มีผู้คลอด');
    expect(value('occupied')).toHaveTextContent(/^4$/);
    expect(screen.getByTestId('ward-kpi-occupied')).toHaveTextContent('ราย');
    expect(screen.getByTestId('ward-kpi-free')).toHaveTextContent('ว่าง');
    expect(value('free')).toHaveTextContent(/^3$/);
    expect(screen.getByTestId('ward-kpi-locked')).toHaveTextContent('ปิด');
    expect(value('locked')).toHaveTextContent(/^2$/);
    expect(screen.getByTestId('ward-kpi-total')).toHaveTextContent('เตียงทั้งหมด');
    expect(value('total')).toHaveTextContent(/^9$/);
    expect(screen.queryByText(/ผู้คลอดบนเตียงล็อก/)).toBeNull();
    expect(screen.queryByText(/ยังไม่ได้จัดเตียง/)).toBeNull();
  });

  it('I2/B1: patients can exceed occupied beds — the legend says so, the footer names unplaced/locked/shared', () => {
    render(
      <WardKpis
        summary={{ ...summary, patients: 6, unplaced: 1, sharedBeds: 1, lockedOccupied: 1 }}
      />,
    );
    const occupied = screen.getByTestId('ward-kpi-occupied');
    expect(value('occupied')).toHaveTextContent(/^6$/);
    expect(occupied).toHaveTextContent('ใช้ 4 เตียง');
    const footer = screen.getByTestId('ward-kpi-total').parentElement!;
    expect(footer).toHaveTextContent('ผู้คลอดบนเตียงล็อก 1');
    expect(footer).toHaveTextContent('ยังไม่ได้จัดเตียง 1');
    expect(footer).toHaveTextContent('เตียงซ้อน 1');
  });

  it('an empty ward shows no occupancy percentage and an explanatory bar label', () => {
    render(
      <WardKpis
        summary={{
          ...summary,
          totalBeds: 0,
          occupied: 0,
          free: 0,
          lockedEmpty: 0,
          occupancyPct: null,
        }}
      />,
    );
    expect(screen.getByRole('region', { name: 'ความจุเตียง' })).not.toHaveTextContent('%');
    expect(screen.getByRole('img')).toHaveAttribute('aria-label', 'วอร์ดนี้ยังไม่มีเตียงในผัง');
  });

  it('urgent > 0: danger tint with a left accent (never a solid red block), count, rule and the hint', () => {
    render(<WardKpis summary={summary} />);
    const panel = screen.getByTestId('ward-kpi-prolonged-latent');
    expect(panel).toHaveAttribute('data-tone', 'danger');
    expect(panel.className).toContain('bg-danger-tint');
    expect(panel.className).toContain('border-l-danger');
    expect(panel.className.split(/\s+/)).not.toContain('bg-danger');
    expect(panel).toHaveTextContent('ระยะแฝงนาน');
    expect(value('prolonged-latent')).toHaveTextContent(/^1$/);
    expect(value('prolonged-latent')!.className).toContain('text-danger-text');
    expect(panel).toHaveTextContent('ราย');
    expect(panel).toHaveTextContent('รับเข้า ≥12 ชม. · ปากมดลูก <4 ซม.');
    expect(screen.getByRole('button', { name: 'คำอธิบาย: ระยะแฝงนาน' })).toBeInTheDocument();
  });

  it('"ดูเตียง" scrolls the first prolonged-latent tile into view and focuses it', () => {
    const tile = document.createElement('article');
    tile.dataset.stage = 'prolongedLatent';
    tile.tabIndex = 0;
    tile.scrollIntoView = vi.fn();
    document.body.append(tile);
    render(<WardKpis summary={summary} />);
    fireEvent.click(screen.getByRole('button', { name: /ดูเตียง/ }));
    expect(tile.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(tile);
  });

  it('urgent = 0: a calm ok panel with a check, no count button', () => {
    render(<WardKpis summary={{ ...summary, prolongedLatent: 0 }} />);
    const panel = screen.getByTestId('ward-kpi-prolonged-latent');
    expect(panel).toHaveAttribute('data-tone', 'ok');
    expect(panel.className).toContain('bg-ok-tint');
    expect(panel.className).not.toContain('danger');
    expect(panel).toHaveTextContent('ไม่มีผู้คลอดระยะแฝงนาน');
    expect(screen.queryByRole('button', { name: /ดูเตียง/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'คำอธิบาย: ระยะแฝงนาน' })).toBeInTheDocument();
  });
});
