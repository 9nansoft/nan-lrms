import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProvinceOverviewPanel } from '@/components/dashboard/province/ProvinceOverviewPanel';
import { ProvinceOverviewDialog } from '@/components/dashboard/province/ProvinceOverviewDialog';
import { makeHospital } from '../../../../helpers/dashboard-fixtures';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/dashboard/ProvinceMap', () => ({
  ProvinceMap: () => <div data-testid="province-map" />,
}));

const hospitals = [makeHospital(), makeHospital({ hcode: '10671', name: 'รพ.ชุมแพ' })];
const base = { hospitals, onlineCount: 1, selected: null, onSelect: vi.fn() };

describe('ProvinceOverviewPanel', () => {
  it('Thai header, one map, list below, sticky under the shell header', () => {
    render(<ProvinceOverviewPanel {...base} mode="map" onModeChange={vi.fn()} onExpand={vi.fn()} />);
    const panel = screen.getByRole('region', { name: 'ภาพรวมโรงพยาบาล' });
    expect(panel).toBe(screen.getByTestId('province-overview'));
    expect(screen.getByText(/เชื่อมต่ออยู่/)).toHaveTextContent('เชื่อมต่ออยู่ 1/2 แห่ง');
    expect(screen.getAllByTestId('province-map')).toHaveLength(1);
    expect(screen.getAllByTestId('hospital-row')).toHaveLength(2);
    expect(panel.className).toContain('@min-[1160px]:sticky');
    expect(panel.className).toContain('var(--app-header-h,0px)');
    expect(screen.queryByText(/HOSPITAL · SORTED BY SEVERITY|Province overview|EXPAND|MAP|LIST/)).toBeNull();
  });
  it('toggle and expand', () => {
    const onModeChange = vi.fn();
    const onExpand = vi.fn();
    render(<ProvinceOverviewPanel {...base} mode="map" onModeChange={onModeChange} onExpand={onExpand} />);
    expect(screen.getByRole('button', { name: 'แผนที่' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'รายชื่อ' }));
    expect(onModeChange).toHaveBeenCalledWith('list');
    fireEvent.click(screen.getByRole('button', { name: 'ขยายแผนที่เต็มจอ' }));
    expect(onExpand).toHaveBeenCalled();
  });
  it('list mode shows no map', () => {
    render(<ProvinceOverviewPanel {...base} mode="list" onModeChange={vi.fn()} onExpand={vi.fn()} />);
    expect(screen.queryByTestId('province-map')).toBeNull();
    expect(screen.getAllByTestId('hospital-row')).toHaveLength(2);
  });
});

describe('ProvinceOverviewDialog', () => {
  it('is a Thai, named dialog with map + list', () => {
    render(<ProvinceOverviewDialog {...base} open onOpenChange={vi.fn()} mode="map" onModeChange={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'ภาพรวมโรงพยาบาล' })).toBeInTheDocument();
    expect(screen.getByText(/กด ESC เพื่อปิด/)).toBeInTheDocument();
    expect(screen.getByTestId('province-map')).toBeInTheDocument();
  });
  it('fills the viewport: grid rows give the body the leftover height', () => {
    render(<ProvinceOverviewDialog {...base} open onOpenChange={vi.fn()} mode="map" onModeChange={vi.fn()} />);
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('grid-rows-[auto_minmax(0,1fr)]');
    expect(cls).toContain('max-w-[96vw]!');
    expect(cls).not.toContain('!max-w');
  });
});
