// CallDirectoryDialog — hospital → online-user picker that starts a call.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CallDirectoryDialog } from '@/components/calls/CallDirectoryDialog';

const DIRECTORY = {
  hospitals: [
    {
      hospitalCode: '11004',
      hospitalName: 'รพ.น้ำพอง',
      users: [{ userId: 'user-callee', name: 'นพ.ปลายทาง ทดสอบ', role: 'user' }],
    },
    {
      hospitalCode: '11005',
      hospitalName: 'รพ.ชนบท',
      users: [{ userId: 'user-other', name: 'นางเพื่อน ร่วมงาน', role: 'admin' }],
    },
  ],
  updatedAt: '2026-07-10T05:00:00.000Z',
};

describe('CallDirectoryDialog', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => DIRECTORY,
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists online users grouped under their hospital', async () => {
    render(<CallDirectoryDialog open onOpenChange={() => {}} onCall={() => {}} />);

    expect(await screen.findByText('รพ.น้ำพอง')).toBeTruthy();
    expect(screen.getByText('รพ.ชนบท')).toBeTruthy();
    expect(screen.getByText('นพ.ปลายทาง ทดสอบ')).toBeTruthy();
    expect(screen.getByText('นางเพื่อน ร่วมงาน')).toBeTruthy();
  });

  it('starts a call with the picked user', async () => {
    const onCall = vi.fn();
    render(<CallDirectoryDialog open onOpenChange={() => {}} onCall={onCall} />);

    await screen.findByText('นพ.ปลายทาง ทดสอบ');
    const callButtons = screen.getAllByRole('button', { name: /โทร/ });
    fireEvent.click(callButtons[0]);

    expect(onCall).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-callee', name: 'นพ.ปลายทาง ทดสอบ' }),
    );
  });

  it('shows an empty state when nobody else is online', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ hospitals: [], updatedAt: DIRECTORY.updatedAt }),
    })) as unknown as typeof fetch;

    render(<CallDirectoryDialog open onOpenChange={() => {}} onCall={() => {}} />);
    expect(await screen.findByText(/ไม่มีผู้ใช้ท่านอื่นออนไลน์/)).toBeTruthy();
  });

  it('shows an actionable Thai error with retry when loading fails', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;

    render(<CallDirectoryDialog open onOpenChange={() => {}} onCall={() => {}} />);
    expect(await screen.findByText(/ไม่สามารถโหลดรายชื่อ/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ลองใหม่/ })).toBeTruthy();
  });
});
