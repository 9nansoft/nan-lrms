// tests/unit/components/shared/status-primitives.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusChip } from '@/components/shared/StatusChip';
import { DismissibleAlert } from '@/components/shared/DismissibleAlert';
import { STATUS_TONE } from '@/config/status-tone';

describe('StatusChip', () => {
  it('renders an optional detail inside the pill that is not a live announcement', () => {
    render(<StatusChip tone="ok" label="เชื่อมต่อ" detail="อัปเดต 10:32" />);
    expect(screen.getByRole('status')).toHaveTextContent('เชื่อมต่อ · อัปเดต 10:32');
    expect(screen.getByText('อัปเดต 10:32')).toHaveAttribute('aria-live', 'off');
  });

  it.each(['ok', 'warn', 'danger', 'neutral'] as const)('%s tone uses the token tint/text classes', (tone) => {
    render(<StatusChip tone={tone} label="สถานะ" title="รายละเอียด" />);
    const chip = screen.getByRole('status');
    expect(chip).toHaveTextContent('สถานะ');
    expect(chip).toHaveAttribute('data-tone', tone);
    expect(chip).toHaveAttribute('title', 'รายละเอียด');
    for (const c of `${STATUS_TONE[tone].tint} ${STATUS_TONE[tone].text}`.split(' ')) expect(chip.className).toContain(c);
  });
  it('pulse animates the dot only when motion is allowed', () => {
    const { container } = render(<StatusChip tone="danger" label="x" pulse />);
    expect(container.querySelector('[aria-hidden="true"]')!.className).toContain('motion-safe:animate-pulse');
  });
});

describe('DismissibleAlert', () => {
  it('shows title, detail and the remedy as "วิธีแก้", and dismisses', () => {
    const onDismiss = vi.fn();
    render(<DismissibleAlert title="ย้ายเตียงไม่สำเร็จ" detail="timeout" remedy="กด รีเฟรช" onDismiss={onDismiss} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('ย้ายเตียงไม่สำเร็จ');
    expect(alert).toHaveTextContent('timeout');
    expect(alert).toHaveTextContent('วิธีแก้: กด รีเฟรช');
    expect(alert.className).toContain('bg-danger-tint');
    fireEvent.click(screen.getByRole('button', { name: 'ซ่อน' }));
    expect(onDismiss).toHaveBeenCalled();
  });
  it('warn tone', () => {
    render(<DismissibleAlert tone="warn" title="t" onDismiss={() => {}} />);
    expect(screen.getByRole('alert').className).toContain('bg-warn-tint');
  });
});
