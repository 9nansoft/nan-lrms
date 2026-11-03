import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const crumbsMock = vi.hoisted(() => ({ value: [{ label: 'ห้องคลอด' }] as { label: string; href?: string }[] }));

vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: { user: { id: 'u1', name: 'ชัยพร ส.', role: 'NURSE', hospitalName: 'รพ.น้ำพอง', hospitalCode: '11000' } },
  }),
  signOut: vi.fn(),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/hospital-maternity-ward' }));
vi.mock('@/hooks/usePresenceHeartbeat', () => ({ usePresenceHeartbeat: vi.fn() }));
vi.mock('@/components/layout/StatusStrip', () => ({ StatusStrip: () => <div data-testid="strip" /> }));
vi.mock('@/components/dashboard/OnlineUsersBadge', () => ({ OnlineUsersBadge: () => null }));
vi.mock('@/components/calls/CallDirectoryButton', () => ({ CallDirectoryButton: () => null }));
vi.mock('@/components/layout/BreadcrumbContext', () => ({
  useBreadcrumbs: () => ({ breadcrumbs: crumbsMock.value, setBreadcrumbs: vi.fn() }),
}));

import { AppShell } from '@/components/layout/AppShell';

describe('AppShell', () => {
  beforeEach(() => {
    crumbsMock.value = [{ label: 'ห้องคลอด' }];
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it('kiosk contract: sidebar is <aside>, top bar is header.sticky, strip lives inside the header', () => {
    const { container } = render(<AppShell variant="hospital">page</AppShell>);
    expect(container.querySelector('aside')).not.toBeNull();
    const header = container.querySelector('header.sticky') as HTMLElement;
    expect(header).not.toBeNull();
    expect(within(header).getByTestId('strip')).toBeInTheDocument();
  });

  it('hospital variant nav: ward (current page) + profile', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/hospital-maternity-ward', '/profile']);
    expect(within(nav).getByRole('link', { name: /ห้องคลอด/ })).toHaveAttribute('aria-current', 'page');
  });

  it('collapse button toggles the rail and keeps accessible names', async () => {
    render(<AppShell variant="hospital">page</AppShell>);
    await userEvent.click(screen.getByRole('button', { name: 'ย่อเมนู' }));
    expect(screen.getByRole('button', { name: 'ขยายเมนู' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /โปรไฟล์/ })).toBeInTheDocument();
  });

  it('header shows breadcrumb, user identity and a logout button', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('ห้องคลอด');
    expect(screen.getByText('ชัยพร ส.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ออกจากระบบ' })).toBeInTheDocument();
  });

  it('mobile drawer button exists with the kiosk-hidden label', () => {
    render(<AppShell variant="hospital">page</AppShell>);
    expect(screen.getByRole('button', { name: 'เปิดเมนู' })).toBeInTheDocument();
  });

  it('falls back to the active nav label when no page sets breadcrumbs', () => {
    crumbsMock.value = [];
    render(<AppShell variant="hospital">page</AppShell>);
    expect(screen.getByRole('navigation', { name: 'breadcrumb' })).toHaveTextContent('ห้องคลอด');
  });

  it('keeps the notification-settings link reachable for the provincial variant', () => {
    render(<AppShell variant="provincial">page</AppShell>);
    expect(screen.getByRole('link', { name: 'การตั้งค่าการแจ้งเตือน' })).toHaveAttribute('href', '/profile');
  });

  it('mobile drawer: focus moves in on open, Escape closes it and returns focus to the menu button', async () => {
    render(<AppShell variant="hospital">page</AppShell>);
    const opener = screen.getByRole('button', { name: 'เปิดเมนู' });
    await userEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'เมนู' });
    expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
