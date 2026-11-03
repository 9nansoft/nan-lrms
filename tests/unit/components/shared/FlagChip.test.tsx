import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlagChip } from '@/components/shared/FlagChip';

describe('FlagChip', () => {
  it('tone renders token text on a tint (AA), never the marker colour as text', () => {
    render(<FlagChip tone="warn">LBW</FlagChip>);
    const chip = screen.getByText('LBW');
    expect(chip.className).toContain('text-warn-text');
    expect(chip.className).toContain('bg-warn-tint');
    expect(chip.getAttribute('style')).toBeNull();
  });
  it('danger and neutral tones', () => {
    render(
      <>
        <FlagChip tone="danger">เกินกำหนด</FlagChip>
        <FlagChip tone="neutral" title="อายุ 35 ปีขึ้นไป">35+</FlagChip>
      </>,
    );
    expect(screen.getByText('เกินกำหนด').className).toContain('text-danger-text');
    expect(screen.getByText('35+').className).toContain('text-ink-muted');
    expect(screen.getByText('35+')).toHaveAttribute('title', 'อายุ 35 ปีขึ้นไป');
  });
  it('legacy color prop still works for /patients/[an]', () => {
    render(<FlagChip color="var(--risk-high)">APGAR</FlagChip>);
    expect(screen.getByText('APGAR').getAttribute('style')).toContain('var(--risk-high)');
  });
});
