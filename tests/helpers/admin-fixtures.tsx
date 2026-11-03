// tests/helpers/admin-fixtures.tsx
// Admin component harness: SWR answers from a fixture map (unmocked keys stay
// pending forever, so a test never crashes on data it did not ask for), and
// global fetch records every mutation for request-shape assertions.
import type { ReactElement } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { AdminHospital } from '@/components/admin/HospitalEditDialog';

export function adminHospital(o: Partial<AdminHospital> = {}): AdminHospital {
  return {
    hcode: '10670', name: 'รพ.น่าน', level: 'A_S', serviceType: null, provinceCode: '40',
    districtCode: '4001', lat: null, lon: null, isActive: true, connectionStatus: 'CONNECTED',
    lastSyncAt: null, bmsConfig: null, ...o,
  };
}

export function renderWithSwr(ui: ReactElement, map: Record<string, unknown>) {
  const fetcher = vi.fn(async (key: string) => {
    if (!(key in map)) return new Promise(() => {});
    const v = map[key];
    if (v instanceof Error) throw v;
    return v;
  });
  const utils = render(
    <SWRConfig value={{ fetcher, provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>,
  );
  return { fetcher, ...utils };
}

type MutationReply = { ok: boolean; status?: number; body?: unknown };
export function stubMutations(reply: (url: string, init?: RequestInit) => MutationReply = () => ({ ok: true, body: {} })) {
  const spy = vi.fn(async (url: string, init?: RequestInit) => {
    const r = reply(url, init);
    return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body ?? {} } as Response;
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}
