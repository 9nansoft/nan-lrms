import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listMaternityWards } from '@/services/maternity-ward';
import type { ConnectionConfig } from '@/types/bms-browser';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const cfg: ConnectionConfig = {
  apiUrl: 'https://t.example/api',
  bearerToken: 'BEARER',
  appIdentifier: 'KK-LRMS.Web',
};

describe('listMaternityWards', () => {
  beforeEach(() => mockFetch.mockReset());

  it('returns the data array from BMS /api/sql', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () {
        return this;
      },
      json: async () => ({
        data: [
          { ward: '03', name: 'ห้องคลอด', real_bedcount: 12 },
          { ward: '04', name: 'ห้องคลอด VIP', real_bedcount: 4 },
        ],
        MessageCode: 200,
        Message: 'ok',
      }),
    });

    const wards = await listMaternityWards(cfg);
    expect(wards).toHaveLength(2);
    expect(wards[0]).toEqual({ ward: '03', name: 'ห้องคลอด', real_bedcount: 12 });
  });

  it('issues a SQL query against the maternity-wards template', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () {
        return this;
      },
      json: async () => ({ data: [], MessageCode: 200, Message: 'ok' }),
    });
    await listMaternityWards(cfg);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sql).toContain('FROM ward');
    expect(body.sql).toContain("is_maternity_ward = 'Y'");
  });

  it('returns empty array when BMS returns no data', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () {
        return this;
      },
      json: async () => ({ data: [], MessageCode: 200, Message: 'ok' }),
    });
    expect(await listMaternityWards(cfg)).toEqual([]);
  });

  it('propagates BMS errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 501,
      statusText: 'Not Implemented',
      clone: function () {
        return { json: async () => ({ MessageCode: 401, Message: 'unauthorized' }) };
      },
      text: async () => '',
    });
    await expect(listMaternityWards(cfg)).rejects.toThrow(/Session unauthorized/);
  });
});
