'use client';

// Header notification bell with unread count badge and clickable popover
// listing all BMS / LINE OA หมอพร้อม alert notifications for the signed-in user.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Bell, CheckCheck, ExternalLink, Settings } from 'lucide-react';
import { StatusChip } from '@/components/shared/StatusChip';
import { Button } from '@/components/ui/button';
import type { StatusTone } from '@/config/status-tone';
import type { AlertSeverity } from '@/config/moph-alert-templates';
import { cn } from '@/lib/utils';

export interface NotificationAlertDto {
  id: string;
  caseId: string;
  hospitalId: string;
  originHcode: string;
  hospitalName: string;
  alertSource: string;
  eventLabelTh: string;
  severity: AlertSeverity;
  title: string;
  messageText: string;
  patientName: string | null;
  confirmUrl: string | null;
  lineStatus: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsApiResponse {
  alerts: NotificationAlertDto[];
  unreadCount: number;
}

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  emergency: 'ฉุกเฉิน',
  high: 'เสี่ยงสูง',
  notify: 'แจ้งเตือน',
};

const SEVERITY_TONE: Record<AlertSeverity, StatusTone> = {
  emergency: 'danger',
  high: 'warn',
  notify: 'brand',
};

const LINE_STATUS_LABEL: Record<string, string> = {
  sent: 'ส่ง BMS/LINE แล้ว',
  pending: 'รอส่ง BMS/LINE',
  processing: 'กำลังส่ง BMS/LINE',
  failed: 'ส่ง LINE ไม่สำเร็จ',
  skipped: 'ข้ามการส่ง LINE',
  expired: 'หมดอายุส่ง LINE',
  awaiting_recipients: 'แจ้งเตือนในระบบ',
};

function fmtDateTimeTh(iso: string): string {
  try {
    return new Date(iso).toLocaleString('th-TH', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NotificationBellButton() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { data, mutate } = useSWR<NotificationsApiResponse>('/api/notifications', {
    refreshInterval: 15_000,
  });

  const alerts = data?.alerts ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function markRead(input: { id?: string; markAll?: boolean }) {
    setBusy(true);
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      await mutate();
    } catch {
      // Best-effort UI action
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        data-testid="notification-bell-button"
        aria-label={
          unreadCount > 0
            ? `ข้อความแจ้งเตือน (ยังไม่อ่าน ${unreadCount} รายการ)`
            : 'ข้อความแจ้งเตือน'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        title="คลิกดูข้อความการแจ้งเตือน (BMS / LINE หมอพร้อม)"
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex items-center gap-1 rounded-lg p-1.5 text-brand transition-colors hover:bg-brand-soft"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            data-testid="notification-bell-badge"
            className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger px-1.5 py-0.5 text-caption font-bold leading-none text-white tabular-nums"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="รายการข้อความการแจ้งเตือน"
          data-testid="notification-popover"
          className="absolute right-0 top-full z-50 mt-2 flex w-80 max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-border bg-surface-card shadow-lg sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3.5 py-2.5">
            <div className="min-w-0">
              <p className="text-label font-semibold text-ink">
                ข้อความการแจ้งเตือน ({unreadCount} ใหม่)
              </p>
              <p className="text-caption text-ink-muted">
                แจ้งเตือนผ่านระบบ, BMS และ LINE OA หมอพร้อม
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {unreadCount > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  data-testid="notification-mark-all-read"
                  onClick={() => void markRead({ markAll: true })}
                  className="h-7 gap-1 border-border px-2 text-caption text-brand hover:bg-brand-soft"
                >
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  อ่านทั้งหมด
                </Button>
              )}
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                title="ตั้งค่าการแจ้งเตือน LINE"
                className="inline-flex items-center gap-1 rounded-lg p-1.5 text-caption text-ink-muted hover:bg-surface-card hover:text-brand"
              >
                <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-border">
            {alerts.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-label font-medium text-ink">ยังไม่มีข้อความการแจ้งเตือน</p>
                <p className="mt-1 text-caption text-ink-muted">
                  เมื่อมีการแจ้งเตือนความเสี่ยง คำปรึกษา หรือแบบประเมิน จะแสดงที่นี่พร้อมส่งไปที่ BMS / LINE หมอพร้อม
                </p>
              </div>
            ) : (
              alerts.map((alert) => {
                const lineStatusText =
                  LINE_STATUS_LABEL[alert.lineStatus] ?? alert.lineStatus;
                return (
                  <div
                    key={alert.id}
                    data-testid="notification-item"
                    onClick={() => {
                      if (!alert.isRead) void markRead({ id: alert.id });
                    }}
                    className={cn(
                      'flex cursor-pointer flex-col gap-1.5 px-3.5 py-2.5 transition-colors hover:bg-surface-muted',
                      !alert.isRead ? 'bg-brand-soft/40' : 'bg-surface-card',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      {!alert.isRead && (
                        <span
                          data-testid="notification-unread-dot"
                          className="h-2 w-2 shrink-0 rounded-full bg-danger"
                          aria-label="ยังไม่อ่าน"
                        />
                      )}
                      <StatusChip
                        tone={SEVERITY_TONE[alert.severity]}
                        label={SEVERITY_LABEL[alert.severity]}
                      />
                      <span className="text-caption font-semibold text-brand">
                        {alert.eventLabelTh}
                      </span>
                      <span className="ml-auto text-caption text-ink-muted tabular-nums">
                        {fmtDateTimeTh(alert.createdAt)}
                      </span>
                    </div>

                    <p className="text-label font-semibold text-ink">{alert.title}</p>
                    <p className="whitespace-pre-line text-caption text-ink-muted">
                      {alert.messageText}
                    </p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <span className="text-caption text-ink-subtle">{lineStatusText}</span>
                      {alert.confirmUrl && (
                        <Link
                          href={alert.confirmUrl}
                          data-testid="notification-item-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!alert.isRead) void markRead({ id: alert.id });
                            setOpen(false);
                          }}
                          className="inline-flex items-center gap-1 text-caption font-semibold text-brand underline"
                        >
                          เปิดดูข้อมูล <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
