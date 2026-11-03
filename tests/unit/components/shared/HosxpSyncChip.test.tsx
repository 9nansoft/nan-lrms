import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HosxpSyncChip } from '@/components/shared/HosxpSyncChip';

describe('HosxpSyncChip', () => {
  it('"{label}: {Thai status}" button; the detail is its tooltip; click opens diagnostics', () => {
    const onOpen = vi.fn();
    render(<HosxpSyncChip status="RUNNING" detail="scheduled · 2/3 cycles" onOpen={onOpen} />);
    const chip = screen.getByRole('button', { name: /^HOSxP: ทำงานอยู่$/ });
    expect(chip).toHaveAttribute('title', 'scheduled · 2/3 cycles');
    expect(chip.className).toContain('bg-ok-tint');
    fireEvent.click(chip);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a page can name the pipeline its own way; tone still follows the status', () => {
    render(
      <HosxpSyncChip label="ส่งข้อมูลเข้า NN-LRMS" status="ERROR" detail="x" onOpen={() => {}} />,
    );
    const chip = screen.getByRole('button', { name: /^ส่งข้อมูลเข้า NN-LRMS: ผิดพลาด$/ });
    expect(chip.className).toContain('bg-danger-tint');
  });

  it('neutral statuses keep the card surface', () => {
    render(<HosxpSyncChip status="SKIPPED" detail="NO BMS SESSION" onOpen={() => {}} />);
    expect(screen.getByRole('button', { name: /ไม่ได้เริ่ม/ }).className).toContain(
      'bg-surface-card',
    );
  });
});
