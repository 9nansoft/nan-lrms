// PartogramChart — TDD tests for 4-panel WHO partogram
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PartogramChart } from '@/components/charts/PartogramChart';
import type { CdssAlertDto, PartographObservationDto } from '@/types/api';

beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Mock Recharts: render thin wrappers so we can assert structure without full SVG.
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  ComposedChart: ({ children, data }: { children: React.ReactNode; data: unknown }) => (
    <div data-testid="composed-chart" data-row-count={(data as unknown[])?.length ?? 0}>
      {children}
    </div>
  ),
  Line: () => <div data-testid="line" />,
  Area: () => <div data-testid="area" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: (props: { domain?: [number, number]; ticks?: number[] }) => (
    <div
      data-testid="x-axis"
      data-domain={JSON.stringify(props.domain)}
      data-ticks={JSON.stringify(props.ticks)}
    />
  ),
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ReferenceArea: () => <div data-testid="reference-area" />,
}));

function makeObservation(
  overrides: Partial<PartographObservationDto> = {},
): PartographObservationDto {
  return {
    id: 'obs-' + Math.random().toString(36).slice(2),
    observeDatetime: '2026-04-19T08:00:00Z',
    hourNo: 0,
    fetalHeartRate: 140,
    amnioticFluid: null,
    amnioticTypeName: null,
    moulding: null,
    cervicalDilationCm: 4,
    descentOfHead: '5/5',
    contractionPer10Min: 3,
    contractionDurationSec: 40,
    contractionStrength: null,
    oxytocinUml: null,
    oxytocinDropsMin: null,
    drugsIvFluids: null,
    pulse: 80,
    bpSystolic: 120,
    bpDiastolic: 80,
    temperature: 37,
    urineVolumeMl: null,
    urineProtein: null,
    urineGlucose: null,
    urineAcetone: null,
    note: null,
    entryStaff: null,
    ...overrides,
  };
}

const startTime = '2026-04-19T08:00:00Z';

describe('PartogramChart', () => {
  it('renders the empty-state placeholder when observations is empty', () => {
    render(<PartogramChart observations={[]} alerts={[]} startTime={startTime} />);
    expect(screen.getByText(/ยังไม่มีข้อมูล Partogram/)).toBeTruthy();
    // No panel testids should appear
    expect(screen.queryByTestId('partogram-panel-fhr')).toBeNull();
  });

  it('renders all four panels when given observations', () => {
    const observations = [
      makeObservation({ hourNo: 0 }),
      makeObservation({ hourNo: 2, observeDatetime: '2026-04-19T10:00:00Z', cervicalDilationCm: 5 }),
      makeObservation({ hourNo: 4, observeDatetime: '2026-04-19T12:00:00Z', cervicalDilationCm: 6 }),
    ];
    render(<PartogramChart observations={observations} alerts={[]} startTime={startTime} />);
    expect(screen.getByTestId('partogram-panel-fhr')).toBeTruthy();
    expect(screen.getByTestId('partogram-panel-cervix')).toBeTruthy();
    expect(screen.getByTestId('partogram-panel-contractions')).toBeTruthy();
    expect(screen.getByTestId('partogram-panel-vitals')).toBeTruthy();
  });

  it('does not render a severity chip when alerts is empty', () => {
    const observations = [makeObservation()];
    render(<PartogramChart observations={observations} alerts={[]} startTime={startTime} />);
    // Header shows just the label, no count
    expect(screen.getByText(/Partograph/)).toBeTruthy();
    expect(screen.queryByText(/วิกฤต/)).toBeNull();
    expect(screen.queryByText(/เตือน/)).toBeNull();
    expect(screen.queryByText(/ระวัง/)).toBeNull();
  });

  it('shows severity chip with Thai label + total count for highest severity', () => {
    const observations = [makeObservation()];
    const alerts: CdssAlertDto[] = [
      { severity: 'ALERT', section: 'CERVIX', message: 'crossed alert', obsIndex: 0 },
    ];
    render(<PartogramChart observations={observations} alerts={alerts} startTime={startTime} />);
    expect(screen.getByText(/เตือน 1 ครั้ง/)).toBeTruthy();
  });

  it('chip reflects highest severity when alerts span multiple severities', () => {
    const observations = [makeObservation()];
    const alerts: CdssAlertDto[] = [
      { severity: 'WARN', section: 'CONTRACTIONS', message: 'few contractions', obsIndex: 0 },
      { severity: 'CRITICAL', section: 'FHR', message: 'fhr critical', obsIndex: 0 },
      { severity: 'ALERT', section: 'CERVIX', message: 'crossed alert', obsIndex: 0 },
    ];
    render(<PartogramChart observations={observations} alerts={alerts} startTime={startTime} />);
    // Highest is CRITICAL → label "วิกฤต"; total is 3
    expect(screen.getByText(/วิกฤต 3 ครั้ง/)).toBeTruthy();
  });

  it('shares a single x-axis domain (0..24) and tick set across all four panels', () => {
    const observations = [
      makeObservation({ hourNo: 0 }),
      makeObservation({ hourNo: 4, observeDatetime: '2026-04-19T12:00:00Z' }),
    ];
    render(<PartogramChart observations={observations} alerts={[]} startTime={startTime} />);
    const axes = screen.getAllByTestId('x-axis');
    expect(axes.length).toBe(4);
    for (const axis of axes) {
      expect(axis.getAttribute('data-domain')).toBe('[0,24]');
      expect(axis.getAttribute('data-ticks')).toBe('[0,4,8,12,16,20,24]');
    }
  });

  it('passes one chart-data row per observation to each panel', () => {
    const observations = [makeObservation(), makeObservation(), makeObservation()];
    render(<PartogramChart observations={observations} alerts={[]} startTime={startTime} />);
    const charts = screen.getAllByTestId('composed-chart');
    expect(charts.length).toBe(4);
    for (const chart of charts) {
      expect(chart.getAttribute('data-row-count')).toBe('3');
    }
  });
});
