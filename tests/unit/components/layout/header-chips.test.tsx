// Header chips on the light app header: Thai presence label and a visible
// video-call button (it was text-white/70 on a light header = invisible).
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';

const calls = vi.hoisted(() => ({ value: { openDirectory: () => undefined } as unknown }));
vi.mock('@/components/calls/CallProvider', () => ({ useVideoCall: () => calls.value }));

import { OnlineUsersBadge } from '@/components/dashboard/OnlineUsersBadge';
import { CallDirectoryButton } from '@/components/calls/CallDirectoryButton';

describe('OnlineUsersBadge', () => {
  it('reads "ออนไลน์ N คน" in Thai, not mono English USERS', () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), fetcher: async () => ({ users: [], total: 3, updatedAt: '' }) }}>
        <OnlineUsersBadge />
      </SWRConfig>,
    );
    const chip = screen.getByLabelText(/ออนไลน์/);
    expect(chip.textContent).not.toMatch(/USERS/);
    expect(chip.className).not.toMatch(/font-mono/);
    expect(chip.textContent).toMatch(/ออนไลน์/);
  });
});

describe('CallDirectoryButton', () => {
  it('uses a token colour that is visible on the light header', () => {
    render(<CallDirectoryButton />);
    const btn = screen.getByRole('button', { name: 'โทรวิดีโอ' });
    expect(btn.className).not.toMatch(/text-white/);
    expect(btn.className).toMatch(/text-ink-muted/);
  });
});
