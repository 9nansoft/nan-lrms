'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { navItemsFor, ROLE_LABELS, type ShellVariant } from '@/config/nav';
import { useSidebarState } from '@/hooks/useSidebarState';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { Sidebar } from '@/components/layout/Sidebar';
import { AppHeader } from '@/components/layout/AppHeader';
import { StatusStrip } from '@/components/layout/StatusStrip';

export function AppShell({ variant, children }: { variant: ShellVariant; children: ReactNode }) {
  const pathname = usePathname() ?? '/';
  const { data: session } = useSession();
  const { collapsed, toggle } = useSidebarState();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const role = session?.user?.role;
  const items = navItemsFor(variant, role);
  const homeHref = variant === 'hospital' ? '/hospital-maternity-ward' : '/';
  usePresenceHeartbeat(pathname, session?.user?.id);

  // Mobile drawer a11y: Escape closes; focus moves into the drawer on open and
  // returns to whatever opened it (the menu button) on close.
  useEffect(() => {
    if (!drawerOpen) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = drawerRef.current?.querySelector<HTMLElement>('aside a[href], aside button');
    (first ?? drawerRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openerRef.current?.focus();
    };
  }, [drawerOpen]);

  const isActive = useCallback(
    (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href)),
    [pathname],
  );
  const fallbackLabel = items.find((i) => isActive(i.href))?.label;

  return (
    <div className="flex min-h-screen bg-surface-page">
      <Sidebar
        items={items}
        isActive={isActive}
        collapsed={collapsed}
        onToggle={toggle}
        homeHref={homeHref}
        className="sticky top-0 hidden h-screen lg:flex"
      />
      {drawerOpen && (
        <div ref={drawerRef} tabIndex={-1} className="fixed inset-0 z-40 outline-none lg:hidden" role="dialog" aria-modal="true" aria-label="เมนู">
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
          />
          <Sidebar
            items={items}
            isActive={isActive}
            collapsed={false}
            onToggle={() => setDrawerOpen(false)}
            homeHref={homeHref}
            onNavigate={() => setDrawerOpen(false)}
            className="relative h-full"
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          userName={session?.user?.name ?? ''}
          roleLabel={role ? (ROLE_LABELS[role] ?? role) : ''}
          hospitalName={session?.user?.hospitalName ?? ''}
          onOpenDrawer={() => setDrawerOpen(true)}
          strip={<StatusStrip variant={variant} />}
          fallbackLabel={fallbackLabel}
        />
        {children}
      </div>
    </div>
  );
}
