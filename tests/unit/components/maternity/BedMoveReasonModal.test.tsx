/* @vitest-environment jsdom */
// Task 52: BedMoveReasonModal tests — TDD: written FIRST.
// The modal is presentational only; the actual movePatientBed call is fired
// by the WardLayoutView dispatcher after onConfirm bubbles back up.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BedMoveReasonModal } from '@/components/maternity/BedMoveReasonModal';

const reasons = ['ตามคำขอผู้ป่วย', 'ฉุกเฉิน', 'อื่นๆ'];

describe('BedMoveReasonModal', () => {
  it('renders the from→to bed text in Thai', () => {
    render(
      <BedMoveReasonModal
        open
        reasons={reasons}
        onConfirm={() => {}}
        onCancel={() => {}}
        fromBedno="01"
        toBedno="05"
      />,
    );
    // Title
    expect(screen.getByText('ย้ายเตียง')).toBeInTheDocument();
    // Both bed numbers appear in the from-to sentence
    expect(screen.getByText(/เตียง 01/)).toBeInTheDocument();
    expect(screen.getByText(/เตียง 05/)).toBeInTheDocument();
  });

  it('lists all reasons as <option> values', () => {
    render(
      <BedMoveReasonModal
        open
        reasons={reasons}
        onConfirm={() => {}}
        onCancel={() => {}}
        fromBedno="01"
        toBedno="05"
      />,
    );
    const select = screen.getByRole('combobox');
    const options = Array.from(select.querySelectorAll('option')).map(
      (o) => o.textContent ?? '',
    );
    for (const r of reasons) {
      expect(options).toContain(r);
    }
  });

  it('Confirm fires onConfirm with the selected reason value', () => {
    const onConfirm = vi.fn();
    render(
      <BedMoveReasonModal
        open
        reasons={reasons}
        onConfirm={onConfirm}
        onCancel={() => {}}
        fromBedno="01"
        toBedno="05"
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'ฉุกเฉิน' } });
    fireEvent.click(screen.getByRole('button', { name: /ยืนยัน|ตกลง|Confirm/i }));
    expect(onConfirm).toHaveBeenCalledWith('ฉุกเฉิน');
  });

  it('Cancel fires onCancel and not onConfirm', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <BedMoveReasonModal
        open
        reasons={reasons}
        onConfirm={onConfirm}
        onCancel={onCancel}
        fromBedno="01"
        toBedno="05"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /ยกเลิก|Cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing when open=false', () => {
    const { container } = render(
      <BedMoveReasonModal
        open={false}
        reasons={reasons}
        onConfirm={() => {}}
        onCancel={() => {}}
        fromBedno="01"
        toBedno="05"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
