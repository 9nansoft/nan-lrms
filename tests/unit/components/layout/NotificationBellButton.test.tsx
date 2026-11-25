/* @vitest-environment jsdom */
// TDD tests for NotificationBellButton — badge count, clicking to open
// notification message viewer, and marking notifications as read.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NotificationBellButton,
  type NotificationAlertDto,
} from '@/components/layout/NotificationBellButton';
import { renderWithSwr, stubMutations } from '../../../helpers/admin-fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const SAMPLE_ALERTS: NotificationAlertDto[] = [
  {
    id: 'alert-1',
    caseId: 'AN 6700999 (แรกรับ)',
    hospitalId: 'hosp-hub',
    originHcode: '11002',
    hospitalName: 'รพ.ปัว',
    alertSource: 'maternity_assessment',
    eventLabelTh: 'แบบประเมินห้องคลอด 3 ใบ (แรกรับ / ระยะคลอด / หลังคลอด)',
    severity: 'notify',
    title: 'แจ้งเตือนแบบประเมิน (แรกรับ) — รพ.ปัว',
    messageText: 'แจ้งเตือนคำปรึกษา\nโรงพยาบาลต้นทาง: รพ.ปัว\nกรณี: AN 6700999 (แรกรับ)',
    patientName: 'นาง ทดสอบ ประเมินคลอด',
    confirmUrl: '/patients/11002-6700999',
    lineStatus: 'sent',
    isRead: false,
    readAt: null,
    createdAt: '2026-11-25T08:00:00.000Z',
  },
  {
    id: 'alert-2',
    caseId: 'AN 6700888',
    hospitalId: 'hosp-hub',
    originHcode: '11003',
    hospitalName: 'รพ.ท่าวังผา',
    alertSource: 'cpd_high',
    eventLabelTh: 'คะแนน CPD เสี่ยงสูง',
    severity: 'high',
    title: 'แจ้งเตือนกรณีเสี่ยงสูง — รพ.ท่าวังผา',
    messageText: 'แจ้งเตือนเสี่ยงสูง\nโรงพยาบาลต้นทาง: รพ.ท่าวังผา\nกรณี: AN 6700888',
    patientName: null,
    confirmUrl: '/patients/11003-6700888',
    lineStatus: 'pending',
    isRead: false,
    readAt: null,
    createdAt: '2026-11-25T07:30:00.000Z',
  },
];

describe('NotificationBellButton', () => {
  it('displays the unread badge count and opens the notification message viewer when clicked', async () => {
    renderWithSwr(<NotificationBellButton />, {
      '/api/notifications': {
        alerts: SAMPLE_ALERTS,
        unreadCount: 2,
      },
    });

    const badge = await screen.findByTestId('notification-bell-badge');
    expect(badge).toHaveTextContent('2');

    await userEvent.click(screen.getByTestId('notification-bell-button'));

    const popover = await screen.findByTestId('notification-popover');
    expect(within(popover).getByText('ข้อความการแจ้งเตือน (2 ใหม่)')).toBeInTheDocument();

    const items = within(popover).getAllByTestId('notification-item');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('แจ้งเตือนแบบประเมิน (แรกรับ) — รพ.ปัว');
    expect(items[0]).toHaveTextContent('ส่ง BMS/LINE แล้ว');
    expect(items[1]).toHaveTextContent('แจ้งเตือนกรณีเสี่ยงสูง — รพ.ท่าวังผา');
    expect(items[1]).toHaveTextContent('รอส่ง BMS/LINE');
  });

  it('posts to /api/notifications/read when clicking อ่านทั้งหมด', async () => {
    const fetchSpy = stubMutations(() => ({
      ok: true,
      status: 200,
      body: { ok: true, unreadCount: 0 },
    }));

    renderWithSwr(<NotificationBellButton />, {
      '/api/notifications': {
        alerts: SAMPLE_ALERTS,
        unreadCount: 2,
      },
    });

    await userEvent.click(await screen.findByTestId('notification-bell-button'));
    await userEvent.click(await screen.findByTestId('notification-mark-all-read'));

    await waitFor(() =>
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/notifications/read',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ markAll: true }),
        }),
      ),
    );
  });
});
