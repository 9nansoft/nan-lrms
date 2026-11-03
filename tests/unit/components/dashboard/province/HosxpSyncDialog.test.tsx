import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HosxpSyncDialog } from '@/components/dashboard/province/HosxpSyncDialog';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

const state: OnboardHosxpSyncState = {
  ran: true,
  phase: 'querying_hosxp',
  successCount: 2,
  cycleCount: 3,
  lastSteps: [
    { at: '2026-10-11T03:00:00Z', cycle: 3, name: 'fetch_ipt', status: 'success', message: 'ok', counts: { rows: 4 } },
  ],
};

function setClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}
afterEach(() => vi.restoreAllMocks());

describe('HosxpSyncDialog', () => {
  it('Thai title, verbatim diagnostic fields and step log', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="ช่วยเหลือ" />);
    expect(screen.getByRole('dialog', { name: 'สถานะการดึงข้อมูลจาก HOSxP' })).toBeInTheDocument();
    expect(screen.getByText('QUERYING')).toBeInTheDocument();
    expect(screen.getByText('fetch_ipt')).toBeInTheDocument();
    expect(screen.getByText('rows=4')).toBeInTheDocument();
  });
  it('copies the report and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    expect(await screen.findByText('คัดลอกแล้ว')).toBeInTheDocument();
    expect(writeText.mock.calls[0][0]).toContain('STATUS: QUERYING');
  });
  it('a failed copy says what to do instead of failing silently', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    expect(await screen.findByText(/คัดลอกไม่สำเร็จ — เลือกข้อความแล้วกด Ctrl\+C/)).toBeInTheDocument();
  });
  it('M2: failed copy exposes the report in a read-only, pre-selected textarea', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    const box = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain('STATUS: QUERYING');
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(box.value.length);
  });
  it('M2: copy state resets when the dialog closes', async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    const { rerender } = render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    fireEvent.click(screen.getByRole('button', { name: /คัดลอกรายงาน/ }));
    await screen.findByRole('textbox');
    rerender(<HosxpSyncDialog open={false} onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    rerender(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByRole('button', { name: 'คัดลอกรายงาน' })).toBeInTheDocument();
  });
  it('empty step log is explained in Thai', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={{ ran: true }} status="STARTING" help="h" />);
    expect(screen.getByText(/ยังไม่มีบันทึกขั้นตอน/)).toBeInTheDocument();
  });
});

describe('HosxpSyncDialog layout and copy', () => {
  it('overrides the base sm:max-w-sm so the wide layout applies', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    const cls = screen.getByRole('dialog').className;
    expect(cls).toContain('sm:max-w-none');
    expect(cls).not.toContain('sm:max-w-sm');
  });
  it('Thai step-log labels', () => {
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={state} status="QUERYING" help="h" />);
    expect(screen.getByText('บันทึกขั้นตอน')).toBeInTheDocument();
    expect(screen.getByText(/รอบล่าสุด · 1 รายการ/)).toBeInTheDocument();
  });
  it('Thai ANC failure wording', () => {
    const failed: OnboardHosxpSyncState = { ran: true, successCount: 1, lastStats: { anc: { error: 'timeout' } } } as OnboardHosxpSyncState;
    render(<HosxpSyncDialog open onOpenChange={vi.fn()} state={failed} status="RUNNING" help="h" />);
    expect(screen.getByText(/ซิงค์ ANC ไม่สำเร็จ: timeout/)).toBeInTheDocument();
  });
});
