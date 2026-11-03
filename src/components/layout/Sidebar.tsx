'use client';
import Link from 'next/link';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { MANUAL_LINK, type NavItem } from '@/config/nav';
import { BrandMark } from '@/components/shared/BrandMark';
import { cn } from '@/lib/utils';

export interface SidebarProps {
  items: NavItem[];
  isActive: (href: string) => boolean;
  collapsed: boolean;
  onToggle: () => void;
  homeHref: string;
  /** Drawer mode (<1024px): closes on navigation. */
  onNavigate?: () => void;
  className?: string;
}

export function Sidebar({ items, isActive, collapsed, onToggle, homeHref, onNavigate, className }: SidebarProps) {
  const main = items.filter((i) => !i.adminOnly);
  const pinned = items.filter((i) => i.adminOnly);
  const renderItem = ({ href, label, icon: Icon }: NavItem) => {
    const active = isActive(href);
    return (
      <Link
        key={href}
        href={href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? label : undefined}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 text-body font-medium transition-colors',
          active ? 'bg-surface-page text-brand' : 'text-brand-soft hover:bg-white/10 hover:text-white',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className={cn(collapsed && 'sr-only')}>{label}</span>
      </Link>
    );
  };
  const ManualIcon = MANUAL_LINK.icon;
  return (
    <aside
      className={cn(
        'flex h-full flex-col gap-1 bg-brand px-2.5 py-4 text-white transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[232px]',
        className,
      )}
    >
      <Link href={homeHref} className="mb-4 flex items-center gap-2.5 px-2" aria-label="NN-LRMS หน้าแรก">
        <BrandMark tone="onBrand" size="sm" />
        <span className={cn('text-body-lg font-bold', collapsed && 'sr-only')}>NN-LRMS</span>
      </Link>
      <nav aria-label="เมนูหลัก" className="flex flex-1 flex-col gap-1">
        {main.map(renderItem)}
        <div className="flex-1" />
        {/* Static page, not an app route: plain <a> in a new tab. */}
        <a
          href={MANUAL_LINK.href}
          target="_blank"
          rel="noopener"
          onClick={onNavigate}
          title={collapsed ? MANUAL_LINK.label : undefined}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-body font-medium text-brand-soft transition-colors hover:bg-white/10 hover:text-white"
        >
          <ManualIcon className="h-5 w-5 shrink-0" />
          <span className={cn(collapsed && 'sr-only')}>{MANUAL_LINK.label}</span>
        </a>
        {pinned.map(renderItem)}
      </nav>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        className="mt-2 hidden items-center justify-center rounded-xl py-2 text-brand-soft hover:bg-white/10 lg:flex"
      >
        {collapsed ? <ChevronsRight className="h-5 w-5" /> : <ChevronsLeft className="h-5 w-5" />}
      </button>
    </aside>
  );
}
