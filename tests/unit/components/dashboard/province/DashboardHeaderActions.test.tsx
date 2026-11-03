import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardHeaderActions } from '@/components/dashboard/province/DashboardHeaderActions';

const base = {
  sseState: 'connected' as const,
  hosxpStatus: 'RUNNING' as const,
  hosxpDetail: 'scheduled · 2/3 cycles',
  onOpenHosxp: vi.fn(),
  syncing: false,
  onSync: vi.fn(),
  onKiosk: vi.fn(),
};

describe('DashboardHeaderActions', () => {
  it('Thai live status, HOSxP status, sync and kiosk buttons', () => {
    render(<DashboardHeaderActions {...base} />);
    expect(screen.getByRole('status')).toHaveTextContent('อัปเดตสด');
    const hosxp = screen.getByRole('button', { name: /HOSxP: ทำงานอยู่/ });
    expect(hosxp).toHaveAttribute('title', 'scheduled · 2/3 cycles');
    fireEvent.click(hosxp);
    expect(base.onOpenHosxp).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /ดึงข้อมูลทันที/ }));
    expect(base.onSync).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /โหมดจอภาพ/ }));
    expect(base.onKiosk).toHaveBeenCalled();
    expect(screen.queryByText(/LIVE · SSE OK|HOSxP SYNC/)).toBeNull();
  });
  it('shows progress while a sync cycle runs', () => {
    render(<DashboardHeaderActions {...base} syncing />);
    expect(screen.getByRole('button', { name: /กำลังดึงข้อมูล…/ })).toBeDisabled();
  });
  it('error and reconnecting states are visible in the tones', () => {
    render(<DashboardHeaderActions {...base} sseState="reconnecting" hosxpStatus="ERROR" />);
    expect(screen.getByRole('status')).toHaveTextContent('ขาดการเชื่อมต่อ กำลังเชื่อมใหม่…');
    expect(screen.getByRole('status').className).toContain('bg-warn-tint');
    expect(screen.getByRole('button', { name: /HOSxP: ผิดพลาด/ }).className).toContain('bg-danger-tint');
  });
});
