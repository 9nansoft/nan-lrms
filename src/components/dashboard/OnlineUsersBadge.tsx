// Small inline badge — count of currently-online NN-LRMS users plus a
// hover/focus tooltip listing them by name + hospital + page. Sits next
// to the "X/N ONLINE" hospital connection indicator on the provincial
// dashboard so operators can see "is the network live AND who's actively
// looking at it right now?" in one glance.
//
// Auto-refreshes every 15s via SWR. Tooltip shows up to 12 users; if more,
// a "+N more" footer appears.
'use client';

import { COLOR, MIN_TEXT_PX } from '@/config/design-tokens';
import { useState } from 'react';
import useSWR from 'swr';
import { UsersRound } from 'lucide-react';

interface OnlineUser {
  userId: string;
  name: string;
  role: string;
  hospitalCode: string;
  hospitalName: string;
  path: string;
  lastSeenAt: string;
}

interface OnlineUsersResponse {
  users: OnlineUser[];
  total: number;
  updatedAt: string;
}

const TOOLTIP_LIMIT = 12;

function relativeAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  return `${Math.floor(ms / 3_600_000)}h`;
}

export function OnlineUsersBadge() {
  const [open, setOpen] = useState(false);
  const { data } = useSWR<OnlineUsersResponse>('/api/online-users', {
    refreshInterval: 15_000,
  });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const visible = users.slice(0, TOOLTIP_LIMIT);
  const overflow = Math.max(0, users.length - TOOLTIP_LIMIT);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span
        className="inline-flex cursor-default items-center gap-1 rounded-sm border px-1.5 py-0.5 text-caption tabular-nums"
        style={{
          borderColor: 'var(--rule-strong)',
          color: 'var(--ink-navy)',
          background: 'var(--accent-navy-soft)',
        }}
        tabIndex={0}
        aria-label={`ออนไลน์ ${total} คน`}
        data-testid="online-users-badge"
      >
        <UsersRound className="h-3 w-3" />
        <span className="text-[var(--ink-navy-muted)]">ออนไลน์</span>
        <span className="font-semibold">{total}</span>
        <span className="text-[var(--ink-navy-muted)]">คน</span>
      </span>

      {open && total > 0 && (
        <div
          role="tooltip"
          className="absolute z-50 mt-1"
          style={{
            top: '100%',
            right: 0,
            minWidth: 280,
            maxWidth: 360,
            background: '#0b1b2e',
            color: '#e6ecf5',
            border: '1px solid rgba(107,167,229,0.3)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
            padding: '8px 10px',
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <div
            className="mb-1.5 flex items-baseline justify-between"
            style={{
              fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              fontSize: MIN_TEXT_PX,
              color: 'rgba(230,236,245,0.7)',
            }}
          >
            <span>ผู้ใช้ออนไลน์ · {total} คน</span>
            <span>อัปเดตทุก 15 วินาที</span>
          </div>
          <ul className="space-y-1">
            {visible.map((u) => (
              <li
                key={u.userId}
                className="flex items-baseline gap-2"
                style={{ fontSize: MIN_TEXT_PX, lineHeight: 1.3 }}
              >
                <span
                  className="inline-block flex-shrink-0 rounded-full"
                  style={{
                    width: 6,
                    height: 6,
                    background: COLOR.riskLow,
                    boxShadow: '0 0 0 1.5px rgba(34,197,94,0.25)',
                    transform: 'translateY(-1px)',
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span style={{ fontWeight: 600 }}>{u.name}</span>
                  <span
                    style={{
                      color: 'rgba(230,236,245,0.65)',
                      marginLeft: 6,
                      fontFamily:
                        'ui-monospace, Menlo, Consolas, monospace',
                      fontSize: MIN_TEXT_PX,
                    }}
                  >
                    {u.hospitalCode}
                  </span>
                  <div
                    style={{
                      color: 'rgba(230,236,245,0.55)',
                      fontSize: MIN_TEXT_PX,
                      marginTop: 1,
                    }}
                  >
                    {u.hospitalName} · {u.path}
                  </div>
                </span>
                <span
                  style={{
                    fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
                    fontSize: MIN_TEXT_PX,
                    color: 'rgba(230,236,245,0.6)',
                    flexShrink: 0,
                  }}
                  title={new Date(u.lastSeenAt).toLocaleString('th-TH')}
                >
                  {relativeAge(u.lastSeenAt)}
                </span>
              </li>
            ))}
          </ul>
          {overflow > 0 && (
            <div
              className="mt-2 border-t pt-1.5"
              style={{
                borderColor: 'rgba(255,255,255,0.18)',
                fontSize: MIN_TEXT_PX,
                color: 'rgba(230,236,245,0.6)',
                fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
              }}
            >
              และอีก {overflow} คน — ดูที่หน้าผู้ดูแลระบบ แท็บผู้ใช้ออนไลน์
            </div>
          )}
        </div>
      )}
    </span>
  );
}
