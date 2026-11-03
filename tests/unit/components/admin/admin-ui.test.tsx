import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Field, StatusPill, TONE_CLASSES } from '@/components/admin/admin-ui';

describe('admin-ui', () => {
  it('StatusPill text always uses the AA -text shade', () => {
    for (const tone of ['ok', 'warn', 'danger'] as const) {
      render(<StatusPill tone={tone}>{tone}</StatusPill>);
      expect(screen.getByText(tone).className).toContain(`text-${tone}-text`);
    }
    expect(TONE_CLASSES.neutral.chip).toContain('text-ink-muted');
  });
  it('Field associates its label with the control', () => {
    render(<Field label="ระดับโรงพยาบาล" htmlFor="lvl"><select id="lvl" /></Field>);
    expect(screen.getByLabelText('ระดับโรงพยาบาล').tagName).toBe('SELECT');
  });
});
