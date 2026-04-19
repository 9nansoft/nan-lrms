import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listMaternityWards,
  listWardBedsInventory,
  listWardBedsOccupancy,
} from '@/services/maternity-ward';
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

describe('listWardBedsInventory', () => {
  beforeEach(() => mockFetch.mockReset());

  it('passes ward as a SQL param and returns BedSlot[]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () {
        return this;
      },
      json: async () => ({
        data: [
          {
            bedno: '01',
            roomno: 'LR1',
            bed_order: 1,
            bed_lock: 'N',
            bed_status_type_id: 1,
            room_name: 'LR1',
            room_display_number: 1,
          },
          {
            bedno: '02',
            roomno: 'LR1',
            bed_order: 2,
            bed_lock: 'N',
            bed_status_type_id: 1,
            room_name: 'LR1',
            room_display_number: 1,
          },
        ],
        MessageCode: 200,
        Message: 'ok',
      }),
    });
    const beds = await listWardBedsInventory(cfg, '03');
    expect(beds).toHaveLength(2);
    expect(beds[0].bedno).toBe('01');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ ward: '03' });
    expect(body.sql).toContain('FROM bedno');
  });
});

describe('listWardBedsOccupancy', () => {
  beforeEach(() => mockFetch.mockReset());

  it('passes ward as a SQL param and returns BedOccupancy[]', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () {
        return this;
      },
      json: async () => ({
        data: [
          {
            an: 'AN1',
            hn: 'HN1',
            regdate: '2026-04-19',
            regtime: '10:00:00',
            ward: '03',
            bedno: '01',
            roomno: 'LR1',
            bedtype: null,
            roomname: 'LR1',
            pname: null,
            fname: 'นางA',
            lname: null,
            birthday: '1998-01-01',
            gravida: 2,
            ga: 38,
            incharge_doctor_name: 'ดร.X',
            last_observation_at: '2026-04-19T08:00:00',
            last_cervix_cm: 4,
          },
        ],
        MessageCode: 200,
        Message: 'ok',
      }),
    });
    const occ = await listWardBedsOccupancy(cfg, '03');
    expect(occ).toHaveLength(1);
    expect(occ[0].an).toBe('AN1');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ ward: '03' });
    expect(body.sql).toContain("i.confirm_discharge = 'N'");
  });
});
