// tests/unit/components/layout/StatusStrip.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { FreshnessSnapshot } from '@/hooks/useSyncFreshness';
import { SYNC_FRESHNESS_POLL } from '@/config/hospital-network';

const swrState: { data?: FreshnessSnapshot; error?: Error; isLoading: boolean; mutate: () => void } = {
  isLoading: false,
  mutate: vi.fn(),
};
vi.mock('@/hooks/useSyncFreshness', () => ({ useSyncFreshness: () => swrState }));
// Type-only import above is erased; the mock replaces the runtime module.

import { StatusStrip } from '@/components/layout/StatusStrip';

const summary: FreshnessSnapshot = {
  receivedAt: Date.now(),
  generatedAt: '2026-10-11T05:40:00Z',
  province: { reporting: 27, fresh: 16, stale: 10, never: 1, highRisk: 2, lastSyncAt: '2026-10-11T05:38:00Z' },
  own: { hcode: '11000', name: 'รพ.น้ำพอง', lastSyncAt: '2026-10-11T05:38:00Z', health: 'ok', highRisk: 1 },
};

describe('StatusStrip', () => {
  beforeEach(() => {
    summary.receivedAt = Date.now();
    swrState.data = undefined;
    swrState.error = undefined;
    swrState.isLoading = false;
  });

  it('provincial: fresh x/y, stale count linking to hospitals, high-risk link', () => {
    swrState.data = summary;
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByText(/ข้อมูลสด/)).toHaveTextContent('ข้อมูลสด 16/27 รพ.');
    expect(screen.getByRole('link', { name: /ไม่ซิงค์เกิน 1 ชม\. 10 รพ\./ })).toHaveAttribute('href', '/hospitals');
    expect(screen.getByRole('link', { name: /^CPD เสี่ยงสูง 2 ราย/ })).toHaveAttribute('href', '/');
    expect(screen.getByText(/ยังไม่เคยซิงค์/)).toHaveTextContent('ยังไม่เคยซิงค์ 1 รพ.');
  });

  it('hospital: own freshness badge + ward high-risk link', () => {
    swrState.data = summary;
    render(<StatusStrip variant="hospital" />);
    expect(screen.getByRole('status')).toHaveTextContent('ข้อมูลจาก HOSxP ล่าสุด');
    expect(screen.getByRole('link', { name: 'CPD เสี่ยงสูง 1 ราย' })).toHaveAttribute('href', '/hospital-maternity-ward');
  });

  it('hospital session without an own block explains why', () => {
    swrState.data = { ...summary, own: null };
    render(<StatusStrip variant="hospital" />);
    expect(screen.getByText('บัญชีนี้ไม่ได้ผูกกับโรงพยาบาลที่ส่งข้อมูล')).toBeInTheDocument();
  });

  it('zero high risk is neutral, never a green all-clear', () => {
    swrState.data = { ...summary, province: { ...summary.province, fresh: 27, stale: 0, never: 0, highRisk: 0 } };
    render(<StatusStrip variant="provincial" />);
    const el = screen.getByText('CPD เสี่ยงสูง 0');
    expect(el).toHaveClass('text-ink-muted');
    expect(screen.queryByText('ไม่มีผู้คลอดเสี่ยงสูง')).not.toBeInTheDocument();
  });

  it('hospital with non-ok data: number suppressed, shows stale notice', () => {
    swrState.data = { ...summary, own: { ...summary.own!, health: 'stale' } };
    render(<StatusStrip variant="hospital" />);
    const el = screen.getByText('CPD เสี่ยงสูง — (ข้อมูลไม่เป็นปัจจุบัน)');
    expect(el).toHaveClass('text-warn-text');
    expect(screen.queryByRole('link', { name: /CPD เสี่ยงสูง 1/ })).not.toBeInTheDocument();
  });

  it('hospital badge uses the server classification, not the client clock', () => {
    swrState.data = { ...summary, own: { ...summary.own!, lastSyncAt: '2020-01-01T00:00:00Z', health: 'ok' } };
    render(<StatusStrip variant="hospital" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'ok');
  });

  it('provincial incomplete data: suffix says how many hospitals are missing', () => {
    swrState.data = summary; // 27 reporting, 16 fresh -> 11 missing
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByRole('link', { name: /CPD เสี่ยงสูง 2 ราย · ข้อมูลไม่ครบ 11 รพ\./ })).toBeInTheDocument();
  });

  it('provincial complete data: no incomplete suffix', () => {
    swrState.data = { ...summary, province: { ...summary.province, fresh: 27, stale: 0, never: 0 } };
    render(<StatusStrip variant="provincial" />);
    expect(screen.queryByText(/ข้อมูลไม่ครบ/)).not.toBeInTheDocument();
  });

  it('API failure: quiet Thai notice with retry, page keeps working', async () => {
    swrState.error = new Error('HTTP 500');
    render(<StatusStrip variant="provincial" />);
    expect(screen.getByText('ไม่สามารถตรวจสอบสถานะข้อมูลได้')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
    expect(swrState.mutate).toHaveBeenCalled();
  });

  describe('snapshot no longer current (refresh failing or hung)', () => {
    it('hospital: refresh error with cached data → no green badge, no CPD number, retry + since-when', async () => {
      swrState.data = summary; // own.health 'ok' in the cached payload
      swrState.error = new Error('HTTP 503');
      render(<StatusStrip variant="hospital" />);
      expect(screen.getByText(/ตรวจสอบสถานะข้อมูลไม่ได้ตั้งแต่/)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument(); // no FreshnessBadge
      expect(screen.queryByRole('link', { name: /CPD เสี่ยงสูง 1/ })).not.toBeInTheDocument();
      expect(screen.getByText('CPD เสี่ยงสูง — (ข้อมูลไม่เป็นปัจจุบัน)')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));
      expect(swrState.mutate).toHaveBeenCalled();
    });

    it('hospital: snapshot older than max age without an error is also not current', () => {
      swrState.data = { ...summary, receivedAt: Date.now() - SYNC_FRESHNESS_POLL.maxSnapshotAgeMs - 1_000 };
      render(<StatusStrip variant="hospital" />);
      expect(screen.getByText(/ตรวจสอบสถานะข้อมูลไม่ได้ตั้งแต่/)).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('provincial: refresh error with cached data → stale counts and CPD number hidden', () => {
      swrState.data = summary;
      swrState.error = new Error('HTTP 500');
      render(<StatusStrip variant="provincial" />);
      expect(screen.getByText(/ตรวจสอบสถานะข้อมูลไม่ได้ตั้งแต่/)).toBeInTheDocument();
      expect(screen.queryByText(/ข้อมูลสด/)).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /CPD เสี่ยงสูง 2/ })).not.toBeInTheDocument();
      expect(screen.getByText('CPD เสี่ยงสูง — (ข้อมูลไม่เป็นปัจจุบัน)')).toBeInTheDocument();
    });

    it('recovers: a fresh snapshot without error renders normally again', () => {
      swrState.data = { ...summary, receivedAt: Date.now() };
      render(<StatusStrip variant="hospital" />);
      expect(screen.queryByText(/ตรวจสอบสถานะข้อมูลไม่ได้ตั้งแต่/)).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'ok');
    });
  });

  it('loading renders a fixed-height placeholder (no layout jump)', () => {
    swrState.isLoading = true;
    const { container } = render(<StatusStrip variant="provincial" />);
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
  });
});
