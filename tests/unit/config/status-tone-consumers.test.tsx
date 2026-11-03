// Characterization: pins the exact class strings every tone-consuming surface
// renders TODAY, so consolidating onto STATUS_TONE cannot change a pixel.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill, TONE_CLASSES } from '@/components/admin/admin-ui';
import { FlagChip } from '@/components/shared/FlagChip';
import { FreshnessBadge } from '@/components/shared/FreshnessBadge';
import { DashboardHeaderActions } from '@/components/dashboard/province/DashboardHeaderActions';

const CHIP = {
  ok: 'border-ok/40 bg-ok-tint text-ok-text',
  warn: 'border-warn/40 bg-warn-tint text-warn-text',
  danger: 'border-danger/40 bg-danger-tint text-danger-text',
  brand: 'border-brand/30 bg-brand-soft text-brand',
  neutral: 'border-border bg-surface-muted text-ink-muted',
} as const;
const DOT = { ok: 'bg-ok', warn: 'bg-warn', danger: 'bg-danger', brand: 'bg-brand', neutral: 'bg-ink-subtle' } as const;
const TEXT = {
  ok: 'text-ok-text',
  warn: 'text-warn-text',
  danger: 'text-danger-text',
  brand: 'text-brand',
  neutral: 'text-ink-muted',
} as const;
const tones = ['ok', 'warn', 'danger', 'brand', 'neutral'] as const;

describe('status tone consumers (characterization)', () => {
  it('admin TONE_CLASSES + StatusPill', () => {
    for (const t of tones) {
      expect(TONE_CLASSES[t]).toEqual({ chip: CHIP[t], text: TEXT[t], dot: DOT[t] });
      const { unmount } = render(<StatusPill tone={t}>{`pill-${t}`}</StatusPill>);
      expect(screen.getByText(`pill-${t}`).className).toContain(CHIP[t]);
      unmount();
    }
  });

  it('FlagChip renders per tone (brand keeps text-brand-strong)', () => {
    const expected = { ...CHIP, brand: 'border-brand/30 bg-brand-soft text-brand-strong' };
    for (const t of tones) {
      const { unmount } = render(<FlagChip tone={t}>{`flag-${t}`}</FlagChip>);
      expect(screen.getByText(`flag-${t}`).className).toContain(expected[t]);
      unmount();
    }
  });

  it('FreshnessBadge text + dot per tone', () => {
    const map = { ok: 'ok', stale: 'warn', critical: 'danger' } as const;
    for (const health of ['ok', 'stale', 'critical'] as const) {
      const tone = map[health];
      const { container, unmount } = render(<FreshnessBadge lastSyncAt={null} health={health} />);
      expect(screen.getByRole('status').className).toContain(TEXT[tone]);
      expect(container.querySelector('span[aria-hidden]')!.className).toContain(DOT[tone]);
      unmount();
    }
  });

  it('dashboard HOSxP chip per tone (neutral keeps bg-surface-card)', () => {
    const cases = [
      ['ERROR', 'border-danger/40 bg-danger-tint text-danger-text', 'bg-danger'],
      ['RUNNING', 'border-ok/40 bg-ok-tint text-ok-text', 'bg-ok'],
      ['STARTING', 'border-border bg-surface-card text-ink-muted', 'bg-ink-subtle'],
    ] as const;
    for (const [status, box, dot] of cases) {
      const { container, unmount } = render(
        <DashboardHeaderActions
          sseState="connected"
          hosxpStatus={status}
          hosxpDetail="d"
          onOpenHosxp={() => {}}
          syncing={false}
          onSync={() => {}}
          onKiosk={() => {}}
        />,
      );
      const btn = container.querySelector('button[title="d"]')!;
      expect(btn.className).toContain(box);
      expect(btn.querySelector('span[aria-hidden]')!.className).toContain(dot);
      unmount();
    }
  });
});
