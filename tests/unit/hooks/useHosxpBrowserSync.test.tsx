import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderHook, act } from '@testing-library/react';
import { useHosxpBrowserSync } from '@/hooks/useHosxpBrowserSync';

const h = vi.hoisted(() => ({
  runNow: vi.fn(async () => null),
  poll: { isRunning: false } as { isRunning: boolean },
  webhook: null as { ran: boolean; error?: string } | null,
  sync: null as Record<string, unknown> | null,
}));

vi.mock('@/hooks/useBrowserPoll', () => ({
  useBrowserPoll: () => ({ state: h.poll, runNow: h.runNow }),
}));
vi.mock('@/hooks/useOnboardHosxpWebhook', () => ({
  useOnboardHosxpWebhook: () => ({ state: h.webhook }),
}));
vi.mock('@/hooks/useOnboardHosxpSync', () => ({ useOnboardHosxpSync: () => ({ state: h.sync }) }));

beforeEach(() => {
  vi.clearAllMocks();
  h.poll = { isRunning: false };
  h.webhook = null;
  h.sync = null;
});

describe('useHosxpBrowserSync', () => {
  it('before onboarding reports anything: STARTING, no error, not syncing', () => {
    const { result } = renderHook(() => useHosxpBrowserSync());
    expect(result.current.hosxpStatus).toBe('STARTING');
    expect(result.current.hosxpDetail).toBe('CONNECTING');
    expect(result.current.hosxpHelp).toBe('ระบบกำลังเริ่มการเชื่อมต่อ HOSxP');
    expect(result.current.onboardingError).toBeNull();
    expect(result.current.syncing).toBe(false);
  });

  it('derives status/detail/help from the onboarding sync state (one rule for both pages)', () => {
    h.sync = { ran: true, started: true, phase: 'scheduled', successCount: 2, cycleCount: 3 };
    const { result } = renderHook(() => useHosxpBrowserSync());
    expect(result.current.hosxpSyncState).toBe(h.sync);
    expect(result.current.hosxpStatus).toBe('RUNNING');
    expect(result.current.hosxpDetail).toBe('scheduled · 2/3 cycles');
    expect(result.current.hosxpHelp).toBe('ระบบกำลังดึงข้อมูลจาก HOSxP เป็นรอบอัตโนมัติ');
  });

  it('an onboarding failure surfaces as ERROR with an actionable help line', () => {
    h.sync = { ran: true, error: 'hospital_not_registered' };
    const { result } = renderHook(() => useHosxpBrowserSync());
    expect(result.current.hosxpStatus).toBe('ERROR');
    expect(result.current.hosxpHelp).toBe('โรงพยาบาลนี้ยังไม่ได้เปิดใช้งานในทะเบียน NN-LRMS');
  });

  it('passes through the webhook onboarding error and the poll progress', () => {
    h.webhook = { ran: true, error: 'boom' };
    h.poll = { isRunning: true };
    const { result } = renderHook(() => useHosxpBrowserSync());
    expect(result.current.onboardingError).toBe('boom');
    expect(result.current.syncing).toBe(true);
  });

  it('syncNow runs one browser-poll cycle', async () => {
    const { result } = renderHook(() => useHosxpBrowserSync());
    await act(async () => {
      await result.current.syncNow();
    });
    expect(h.runNow).toHaveBeenCalledTimes(1);
  });
});

// Hospitals that only ever open /hospital-maternity-ward must sync exactly
// like `/`. Both pages go through the one shared hook — neither may wire the
// poll/onboarding hooks on its own, or the two pages drift apart again.
describe('sync wiring is shared by `/` and /hospital-maternity-ward', () => {
  const root = join(__dirname, '../../..');
  const sources = {
    'useProvinceDashboard (/)': 'src/hooks/useProvinceDashboard.ts',
    'hospital-maternity-ward page': 'src/app/(hospital)/hospital-maternity-ward/page.tsx',
  };
  it.each(Object.entries(sources))(
    '%s uses useHosxpBrowserSync, not the raw sync hooks',
    (_name, file) => {
      const src = readFileSync(join(root, file), 'utf8');
      expect(src).toContain("from '@/hooks/useHosxpBrowserSync'");
      expect(src).not.toMatch(
        /from '@\/hooks\/(useBrowserPoll|useOnboardHosxpSync|useOnboardHosxpWebhook)'/,
      );
    },
  );
});
