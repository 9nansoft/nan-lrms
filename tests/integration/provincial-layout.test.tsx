/* @vitest-environment jsdom */
// Regression guard for the post-migration provincial layout (Tasks 11-13).
// Asserts the AppShell sidebar replaced the old TopNavBar and that page content
// renders inside <main>. Mocks next-auth and next/navigation so the layout
// renders synchronously without a real session/router.
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import ProvincialLayout from '@/app/(provincial)/layout';

// The shell's async hooks schedule an async setState via queueMicrotask after
// mount. Flush the microtask queue inside act() so React doesn't warn about
// state updates outside act().
async function renderLayout(children: React.ReactNode) {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<ProvincialLayout>{children}</ProvincialLayout>);
    // Allow the queued microtask (initial clock value) to flush.
    await Promise.resolve();
  });
  return result;
}

vi.mock('next-auth/react', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => ({
    data: {
      user: {
        id: 'u1',
        name: 'นางทดสอบ',
        role: 'NURSE' as const,
        hospitalCode: '10670',
        hospitalName: 'รพ.ขอนแก่น',
        tunnelUrl: '',
        databaseType: 'mysql',
      },
    },
  }),
  signOut: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, prefetch: () => {} }),
}));

describe('Provincial layout (post-migration)', () => {
  it('renders the sidebar with all 6 non-admin nav items', async () => {
    await renderLayout(
      <div data-testid="page-content">Hello dashboard</div>,
    );
    // Sidebar nav items (label also appears as the fallback breadcrumb, so scope to the nav)
    const nav = screen.getByRole('navigation', { name: 'เมนูหลัก' });
    for (const label of [
      'แดชบอร์ด',
      'ฝากครรภ์',
      'โรงพยาบาล',
      'ส่งต่อ',
      'ผลลัพธ์ทารก',
      'ห้องคลอด',
    ]) {
      expect(within(nav).getByText(label)).toBeInTheDocument();
    }
    // Hidden for non-admin
    expect(within(nav).queryByText('ตั้งค่า')).not.toBeInTheDocument();
  });

  it('renders page content inside main', async () => {
    await renderLayout(
      <div data-testid="page-content">Hello dashboard</div>,
    );
    expect(screen.getByTestId('page-content')).toBeInTheDocument();
    expect(screen.getByText('Hello dashboard')).toBeInTheDocument();
  });

  it('renders the shell chrome: <aside> sidebar and sticky <header> (kiosk-hideable)', async () => {
    await renderLayout(<div>x</div>);
    expect(document.querySelector('aside')).not.toBeNull();
    expect(document.querySelector('header.sticky')).not.toBeNull();
  });

  it('renders hospital name in the header', async () => {
    await renderLayout(<div>x</div>);
    expect(screen.getByText(/รพ\.ขอนแก่น/)).toBeInTheDocument();
  });
});
