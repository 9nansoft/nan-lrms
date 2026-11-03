// ConnectionStatus component tests
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatus } from '@/components/shared/ConnectionStatus';
import { ConnectionStatus as ConnectionStatusEnum } from '@/types/domain';

describe('ConnectionStatus', () => {
  it('renders green dot + "ออนไลน์" for ONLINE status', () => {
    const { container } = render(
      <ConnectionStatus status={ConnectionStatusEnum.ONLINE} />,
    );
    expect(screen.getByText('ออนไลน์')).toBeTruthy();
    // Green dot should have bg-ok class
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.className).toContain('bg-ok');
    // Label color should be green
    const label = screen.getByText('ออนไลน์');
    expect(label.style.color).toBe('rgb(63, 143, 79)'); // COLOR.riskLow
  });

  it('renders red dot + "ออฟไลน์" for OFFLINE status', () => {
    const { container } = render(
      <ConnectionStatus status={ConnectionStatusEnum.OFFLINE} />,
    );
    expect(screen.getByText('ออฟไลน์')).toBeTruthy();
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.className).toContain('bg-danger');
    const label = screen.getByText('ออฟไลน์');
    expect(label.style.color).toBe('rgb(192, 57, 43)'); // COLOR.riskHigh
  });

  it('renders gray dot + "ไม่ทราบ" for UNKNOWN status', () => {
    const { container } = render(
      <ConnectionStatus status={ConnectionStatusEnum.UNKNOWN} />,
    );
    expect(screen.getByText('ไม่ทราบ')).toBeTruthy();
    const dot = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(dot.className).toContain('bg-gray-400');
    const label = screen.getByText('ไม่ทราบ');
    expect(label.style.color).toBe('rgb(107, 107, 133)'); // COLOR.inkSubtle #6B6B85 (AA; was #9ca3af)
  });

  it('shows last sync timestamp when provided', () => {
    const testDate = new Date('2026-03-09T10:30:00');
    render(
      <ConnectionStatus
        status={ConnectionStatusEnum.ONLINE}
        lastSyncAt={testDate}
      />,
    );
    // Should show the formatted Thai date and time
    // formatThaiDate returns "9 มี.ค. 2569" (Buddhist Era)
    expect(screen.getByText(/มี\.ค\./)).toBeTruthy();
  });

  it('shows no timestamp when lastSyncAt is null', () => {
    const { container } = render(
      <ConnectionStatus
        status={ConnectionStatusEnum.ONLINE}
        lastSyncAt={null}
      />,
    );
    // Should only have the dot and the label, no timestamp span
    const spans = container.querySelectorAll('span');
    // Outer span + dot span + label span = 3; no timestamp span
    const timestampSpan = container.querySelector('.text-xs.text-muted-foreground');
    expect(timestampSpan).toBeNull();
  });
});
