// VitalSignGauge component tests
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VitalSignGauge } from '@/components/charts/VitalSignGauge';

// Mock ResizeObserver for Recharts ResponsiveContainer
beforeAll(() => {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Mock Recharts to avoid rendering issues in jsdom
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  RadialBarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="radial-bar-chart">{children}</div>
  ),
  RadialBar: () => <div data-testid="radial-bar" />,
  PolarAngleAxis: () => <div data-testid="polar-angle-axis" />,
}));

describe('VitalSignGauge', () => {
  const baseProps = {
    label: 'Heart Rate',
    unit: 'bpm',
    min: 40,
    max: 200,
    normalMin: 60,
    normalMax: 100,
  };

  it('renders gauge with current value label', () => {
    render(<VitalSignGauge {...baseProps} value={80} />);
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('Heart Rate')).toBeTruthy();
    expect(screen.getByText('bpm')).toBeTruthy();
  });

  it('shows correct color for normal range (green)', () => {
    render(<VitalSignGauge {...baseProps} value={75} />);
    const valueEl = screen.getByText('75');
    // Value within normalMin-normalMax => green (COLOR.riskLow)
    expect(valueEl.style.color).toBe('rgb(63, 143, 79)'); // COLOR.riskLow
  });

  it('shows correct color for warning range (yellow)', () => {
    // Warning: outside normal but within 80%-120% of normal bounds
    // normalMin=60, 80% of normalMin = 48; value 50 is < 60 but >= 48 => yellow
    render(<VitalSignGauge {...baseProps} value={50} />);
    const valueEl = screen.getByText('50');
    expect(valueEl.style.color).toBe('rgb(208, 138, 0)'); // COLOR.riskMedium
  });

  it('shows correct color for critical range (red)', () => {
    // Critical: below 80% of normalMin or above 120% of normalMax
    // normalMin=60, 80% = 48; value 40 < 48 => red
    render(<VitalSignGauge {...baseProps} value={40} />);
    const valueEl = screen.getByText('40');
    expect(valueEl.style.color).toBe('rgb(192, 57, 43)'); // COLOR.riskHigh
  });

  it('renders label text', () => {
    render(<VitalSignGauge {...baseProps} value={90} />);
    expect(screen.getByText('Heart Rate')).toBeTruthy();
  });

  it('renders null value as dash placeholder', () => {
    render(<VitalSignGauge {...baseProps} value={null} />);
    expect(screen.getByText('-')).toBeTruthy();
    expect(screen.getByText('Heart Rate')).toBeTruthy();
    // Should NOT render the chart
    expect(screen.queryByTestId('responsive-container')).toBeNull();
  });

  it('renders sparkline bars when history is provided', () => {
    const { container } = render(
      <VitalSignGauge {...baseProps} value={80} history={[70, 75, 80, 85]} />,
    );
    // Sparkline bars are rendered as small divs
    const sparklineContainer = container.querySelector('.flex.h-4.items-end');
    expect(sparklineContainer).toBeTruthy();
    // Should have 4 bars (one per history point)
    const bars = sparklineContainer!.querySelectorAll('.w-2');
    expect(bars.length).toBe(4);
  });
});
