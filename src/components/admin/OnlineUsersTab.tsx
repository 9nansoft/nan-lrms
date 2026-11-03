'use client';

import useSWR from 'swr';
import { Clock, Monitor } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { KpiGrid } from '@/components/shared/KpiGrid';
import { KpiTile } from '@/components/shared/KpiTile';
import { DataTable } from '@/components/shared/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ONLINE_USERS_POLL_MS, PRESENCE_TTL_SECONDS } from '@/config/presence';
import { formatRelativeTime } from '@/lib/utils';

interface OnlineUser {
  userId: string;
  name: string;
  role: string;
  hospitalCode: string;
  hospitalName: string;
  authProvider: string;
  accessMode: string;
  path: string;
  ipAddress: string | null;
  userAgent: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

interface OnlineUsersResponse {
  users: OnlineUser[];
  total: number;
  cache: {
    backend: 'redis' | 'memory';
    available: boolean;
  };
  updatedAt: string;
}

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function browserLabel(userAgent: string | null): string {
  if (!userAgent) return '—';
  if (userAgent.includes('Edg/')) return 'Edge';
  if (userAgent.includes('Chrome/')) return 'Chrome';
  if (userAgent.includes('Firefox/')) return 'Firefox';
  if (userAgent.includes('Safari/')) return 'Safari';
  return userAgent.slice(0, 42);
}

export function OnlineUsersTab() {
  const { data, isLoading, error } = useSWR<OnlineUsersResponse>('/api/admin/online-users', {
    refreshInterval: ONLINE_USERS_POLL_MS,
  });

  const users = data?.users ?? [];
  const redisBackend = data?.cache.backend ?? 'memory';

  return (
    <SectionCard
      title="ผู้ใช้ออนไลน์"
      description={`ที่เก็บสถานะ: ${redisBackend === 'redis' ? 'Redis (ใช้ร่วมทุกเครื่อง)' : 'หน่วยความจำของเครื่องนี้ (dev)'} · หายจากรายการเมื่อไม่มีสัญญาณ ${PRESENCE_TTL_SECONDS} วินาที · รีเฟรชทุก ${ONLINE_USERS_POLL_MS / 1000} วินาที${data?.updatedAt ? ` · อัปเดต ${formatTime(data.updatedAt)}` : ''}`}
    >
      <KpiGrid className="mb-4">
        <KpiTile label="ผู้ใช้ออนไลน์ตอนนี้" count={data?.total ?? 0} testId="online-users-total" />
      </KpiGrid>
      {error && (
        <ErrorState
          variant="banner"
          className="mb-3 rounded-xl border"
          message="โหลดรายชื่อผู้ใช้งานออนไลน์ไม่สำเร็จ"
          remedy={`ระบบจะลองใหม่ทุก ${ONLINE_USERS_POLL_MS / 1000} วินาที หากยังไม่ได้ ตรวจสอบ Redis ของเซิร์ฟเวอร์`}
        />
      )}
      <DataTable
        caption="ผู้ใช้ที่เปิดหน้าเว็บอยู่"
        loading={isLoading}
        rows={users}
        rowKey={(u) => u.userId}
        empty={
          <EmptyState
            illustration="generic"
            title="ยังไม่มีผู้ใช้เปิดหน้าเว็บอยู่"
            description="รายชื่อจะปรากฏเมื่อมีผู้ใช้เปิด NN-LRMS และส่งสัญญาณ"
            className="shadow-none"
          />
        }
        columns={[
          {
            key: 'user',
            header: 'ผู้ใช้',
            cell: (u) => (
              <div>
                <div className="text-body text-ink">{u.name}</div>
                <div className="font-mono text-caption text-ink-muted">
                  {u.role} · {u.authProvider} · {u.accessMode}
                </div>
              </div>
            ),
          },
          {
            key: 'hospital',
            header: 'โรงพยาบาล',
            cell: (u) => (
              <div>
                <div className="text-body text-ink">{u.hospitalName || '—'}</div>
                <div className="font-mono text-caption tabular-nums text-ink-muted">{u.hospitalCode || '—'}</div>
              </div>
            ),
          },
          { key: 'path', header: 'หน้า', cell: (u) => <span className="font-mono text-caption text-ink-muted">{u.path}</span> },
          {
            key: 'seen',
            header: 'เห็นล่าสุด',
            cell: (u) => (
              <div>
                <div className="inline-flex items-center gap-1.5 text-label tabular-nums text-ink">
                  <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                  {formatTime(u.lastSeenAt)}
                </div>
                <div className="text-caption text-ink-muted">{formatRelativeTime(u.lastSeenAt)}</div>
              </div>
            ),
          },
          {
            key: 'client',
            header: 'อุปกรณ์',
            cell: (u) => (
              <div>
                <div className="inline-flex items-center gap-1.5 text-label text-ink-muted">
                  <Monitor aria-hidden="true" className="h-3.5 w-3.5" />
                  {browserLabel(u.userAgent)}
                </div>
                <div className="font-mono text-caption tabular-nums text-ink-muted">{u.ipAddress ?? '—'}</div>
              </div>
            ),
          },
        ]}
      />
    </SectionCard>
  );
}
