// TopNavBar — shared provincial/hospital chrome in the 2026-04-21
// air-traffic-control aesthetic: 3-px navy accent rail + navy bar with an
// LR monogram, gold "KK-LRMS" brand, right-aligned nav menu, user identity,
// and logout. Renders on every page (dashboard and otherwise) so the whole
// app has one visual identity.
//
// Dashboard-specific controls (sync, kiosk toggle, simulate button, live
// status) live in their own strip underneath TopNavBar on `/` — see
// `src/app/(provincial)/page.tsx`.
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { LogOut, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, ROLE_LABELS, filterNavByRole } from '@/config/nav';

export type TopNavBarVariant = 'hospital' | 'provincial';

interface TopNavBarProps {
  variant?: TopNavBarVariant;
}

function formatBangkokTime(): string {
  return new Date().toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function useBangkokClock(): string {
  const [time, setTime] = useState('--:--');
  useEffect(() => {
    queueMicrotask(() => setTime(formatBangkokTime()));
    const id = setInterval(() => setTime(formatBangkokTime()), 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TopNavBar({ variant = 'provincial' }: TopNavBarProps = {}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const clock = useBangkokClock();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isHospital = variant === 'hospital';
  const userRole = session?.user?.role;
  const items = isHospital ? [] : filterNavByRole(NAV_ITEMS, userRole);
  const logoHref = isHospital ? '/hospital-maternity-ward' : '/';
  const userName = session?.user?.name ?? '';
  const hospitalName = session?.user?.hospitalName ?? '';
  const hospitalCode = session?.user?.hospitalCode ?? '';
  const roleLabel = userRole ? (ROLE_LABELS[userRole] ?? userRole) : '';

  const isActive = useCallback(
    (href: string) => {
      if (href === '/') return pathname === '/';
      return pathname.startsWith(href);
    },
    [pathname],
  );

  const handleLogout = useCallback(() => {
    signOut({ callbackUrl: '/login' });
  }, []);

  return (
    <header className="sticky top-0 z-30">
      {/* 3-px navy accent rail */}
      <div
        className="h-[3px]"
        style={{
          background:
            'linear-gradient(90deg, var(--accent-navy-strong) 0%, var(--accent-navy) 60%, var(--accent-navy) 100%)',
        }}
      />

      {/* Row 1 — navy bar: brand + identity + logout */}
      <div
        className="flex items-center gap-4 px-5 py-2.5 text-white"
        style={{
          background: 'var(--accent-navy)',
          borderBottom: '1px solid var(--accent-navy-strong)',
        }}
      >
        <Link
          href={logoHref}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-white font-mono text-[13px] font-extrabold shadow-md"
          style={{ color: 'var(--accent-navy-strong)', letterSpacing: '0.02em' }}
          aria-label="KK-LRMS home"
        >
          LR
        </Link>
        <div className="min-w-0">
          <div
            className="text-[20px] font-extrabold leading-tight"
            style={{
              color: '#ffe89a',
              letterSpacing: '-0.015em',
              textShadow: '0 1px 2px rgba(0,0,0,0.25)',
            }}
          >
            KK-LRMS
            <span className="ml-2.5 text-[13px] font-medium text-white/85" style={{ letterSpacing: 0 }}>
              ·{' '}
              <span>{isHospital ? 'ห้องคลอด' : 'OneLR ห้องคลอดหนึ่งเดียว'}</span>
            </span>
          </div>
          <div className="mt-[2px] font-mono text-[10px] tracking-[0.08em] text-white/60">
            PROVINCIAL LABOR-ROOM MONITORING · KHON KAEN
          </div>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3 font-mono text-[11px] text-white/80">
          <span className="hidden font-mono tabular-nums text-white sm:inline">{clock}</span>
          {hospitalName && (
            <span className="hidden items-center gap-1 rounded-sm border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white md:inline-flex">
              {hospitalName}
              {hospitalCode && (
                <span className="text-white/60">·{hospitalCode}</span>
              )}
            </span>
          )}
          {userName && (
            <div className="hidden flex-col items-end font-sans leading-tight md:flex">
              <span className="text-[12px] font-medium text-white">{userName}</span>
              {roleLabel && <span className="text-[10px] text-white/60">{roleLabel}</span>}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="rounded-sm p-1.5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="ออกจากระบบ"
            title="ออกจากระบบ"
          >
            <LogOut className="h-4 w-4" />
          </button>
          {/* Mobile hamburger (provincial only; hospital variant has no nav to toggle) */}
          {!isHospital && (
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="rounded-sm p-1.5 text-white/80 hover:bg-white/10 lg:hidden"
              aria-label="เมนู"
            >
              {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Row 2 — nav menu (provincial only) */}
      {!isHospital && (
        <nav
          className="hidden items-center gap-1 bg-white px-5 py-1.5 lg:flex"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
          aria-label="เมนูหลัก"
        >
          <div className="flex-1" />
          <div className="flex items-center gap-1 overflow-x-auto">
            {items.map(({ href, label, icon: Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors',
                    active
                      ? 'font-semibold'
                      : 'font-medium hover:bg-[var(--accent-navy-soft)]',
                  )}
                  style={{
                    color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                    background: active ? 'var(--accent-navy-soft)' : 'transparent',
                  }}
                >
                  <Icon className="h-[15px] w-[15px]" />
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {/* Mobile drawer */}
      {!isHospital && mobileOpen && (
        <nav
          className="flex flex-col bg-white px-4 py-2 lg:hidden"
          style={{ borderBottom: '1px solid var(--rule-strong)' }}
        >
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-sm px-3 py-2 text-[14px]"
                style={{
                  color: active ? 'var(--accent-navy)' : 'var(--ink-navy-dim)',
                  background: active ? 'var(--accent-navy-soft)' : 'transparent',
                }}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            );
          })}
          <button
            onClick={handleLogout}
            className="mt-2 flex w-full items-center gap-2 rounded-sm px-3 py-2 text-[14px] text-red-600 hover:bg-red-50"
            aria-label="ออกจากระบบ"
          >
            <LogOut className="h-4 w-4" /> ออกจากระบบ
          </button>
        </nav>
      )}
    </header>
  );
}
