'use client';
import Link from 'next/link';
import { Bell, LogOut, Menu } from 'lucide-react';
import { signOut } from 'next-auth/react';
import { useRef, type ReactNode } from 'react';
import { useBreadcrumbs, type Breadcrumb } from '@/components/layout/BreadcrumbContext';
import { OnlineUsersBadge } from '@/components/dashboard/OnlineUsersBadge';
import { CallDirectoryButton } from '@/components/calls/CallDirectoryButton';
import { useCssHeightVar } from '@/hooks/useCssHeightVar';

export interface AppHeaderProps {
  userName: string;
  roleLabel: string;
  hospitalName: string;
  onOpenDrawer: () => void;
  /** Rendered inside the sticky header so kiosk mode hides it too. */
  strip: ReactNode;
  /** Shown as the last crumb when the page has set no breadcrumbs. */
  fallbackLabel?: string;
}

export function AppHeader({
  userName,
  roleLabel,
  hospitalName,
  onOpenDrawer,
  strip,
  fallbackLabel,
}: AppHeaderProps) {
  const { breadcrumbs } = useBreadcrumbs();
  const headerRef = useRef<HTMLElement>(null);
  // Sticky page content (the dashboard overview panel) offsets by this.
  useCssHeightVar(headerRef, '--app-header-h');
  const crumbs: Breadcrumb[] =
    breadcrumbs.length > 0 ? breadcrumbs : fallbackLabel ? [{ label: fallbackLabel }] : [];
  const initials = userName.trim().slice(0, 2);
  return (
    <header ref={headerRef} className="sticky top-0 z-30 bg-surface-page">
      <div className="flex items-center gap-3 border-b border-border px-5 py-2.5">
        <button
          type="button"
          onClick={onOpenDrawer}
          aria-label="เปิดเมนู"
          className="rounded-lg p-1.5 text-brand hover:bg-brand-soft lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <nav aria-label="breadcrumb" className="min-w-0 truncate text-body text-ink-muted">
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`}>
                {i > 0 && <span className="mx-1.5">›</span>}
                {last ? (
                  <b className="text-ink">{c.label}</b>
                ) : c.href ? (
                  <Link href={c.href} className="hover:text-brand hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  c.label
                )}
              </span>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          <OnlineUsersBadge />
          {hospitalName && (
            <span className="hidden rounded-full bg-brand-soft px-3 py-0.5 text-label text-brand-strong xl:inline">
              {hospitalName}
            </span>
          )}
          <Link
            href="/profile"
            aria-label="การตั้งค่าการแจ้งเตือน"
            title="การตั้งค่าการแจ้งเตือน"
            className="rounded-lg p-1.5 text-brand hover:bg-brand-soft xl:p-0 xl:text-label xl:hover:bg-transparent xl:hover:underline"
          >
            <Bell className="h-4 w-4 xl:hidden" />
            <span className="hidden xl:inline">การตั้งค่าการแจ้งเตือน</span>
          </Link>
          <CallDirectoryButton />
          <span className="hidden flex-col items-end leading-tight xl:flex">
            <span className="text-label text-ink">{userName}</span>
            {roleLabel && <span className="text-caption text-ink-muted">{roleLabel}</span>}
          </span>
          <span
            aria-hidden="true"
            title={[userName, roleLabel, hospitalName].filter(Boolean).join(' · ')}
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-caption font-bold text-brand"
          >
            {initials}
          </span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-brand-soft hover:text-brand"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
      {strip}
    </header>
  );
}
