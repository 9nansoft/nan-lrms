import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retrieveBmsSession,
  extractConnectionConfig,
  extractUserInfo,
  executeSql,
  callFunction,
  restInsert,
  restUpdate,
  restDelete,
  APP_IDENTIFIER,
} from '@/lib/bms-browser-client';
import type { ConnectionConfig } from '@/types/bms-browser';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('bms-browser-client.retrieveBmsSession', () => {
  beforeEach(() => mockFetch.mockReset());

  it('POSTs sessionId to PasteJSON and returns parsed body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        jwt: 'eyJ...', bms_url: 'https://t.example/api',
        user_info: { loginname: 'nurse1', fullname: 'Nurse One', hospcode: '10670' },
        expired_second: 3600,
      }),
    });

    const r = await retrieveBmsSession('SID-1');
    expect(r.jwt).toBe('eyJ...');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hosxp.net/phapi/PasteJSON',
      expect.objectContaining({ method: 'POST' }),
    );
    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.session_id).toBe('SID-1');
  });

  it('throws on HTTP 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 401, statusText: 'Unauthorized',
      text: async () => 'session expired',
    });
    await expect(retrieveBmsSession('SID-X')).rejects.toThrow();
  });
});

describe('extractConnectionConfig', () => {
  it('extracts apiUrl + bearerToken + appIdentifier', () => {
    const r = { jwt: 'eyJ...', bms_url: 'https://t.example/api' };
    const c = extractConnectionConfig(r);
    expect(c).toEqual({
      apiUrl: 'https://t.example/api',
      bearerToken: 'eyJ...',
      appIdentifier: APP_IDENTIFIER,
    });
  });

  it('throws when bms_url missing', () => {
    expect(() => extractConnectionConfig({ jwt: 'x' } as never)).toThrow(/bms_url/);
  });

  it('throws when jwt missing', () => {
    expect(() => extractConnectionConfig({ bms_url: 'x' } as never)).toThrow(/jwt/);
  });
});

describe('extractUserInfo', () => {
  it('returns user_info subfield', () => {
    const r = { user_info: { loginname: 'n1', fullname: 'Nurse', hospcode: '10670' } };
    expect(extractUserInfo(r as never)).toMatchObject({ loginname: 'n1', hospcode: '10670' });
  });
});

const cfg: ConnectionConfig = {
  apiUrl: 'https://t.example/api',
  bearerToken: 'BEARER',
  appIdentifier: 'KK-LRMS.Web',
};

describe('executeSql', () => {
  beforeEach(() => mockFetch.mockReset());

  it('POSTs sql to /api/sql with bearer + app identifier', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      clone: function () { return this; },
      json: async () => ({ data: [{ x: 1 }], MessageCode: 200, Message: 'ok' }),
    });
    const r = await executeSql('SELECT 1', cfg);
    expect(r.data).toEqual([{ x: 1 }]);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://t.example/api/api/sql',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer BEARER',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ sql: 'SELECT 1', app: 'KK-LRMS.Web' });
  });

  it('passes params when provided', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      clone: function () { return this; },
      json: async () => ({ data: [], MessageCode: 200, Message: 'ok' }),
    });
    await executeSql('SELECT * FROM x WHERE id = :id', cfg, { id: 42 });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.params).toEqual({ id: 42 });
  });

  it('throws Thai retry message on HTTP 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 429, statusText: 'Too Many Requests',
      headers: { get: (h: string) => h === 'Retry-After' ? '5' : null },
      json: async () => ({ message: 'rate limit' }),
      clone: function () { return this; },
    });
    await expect(executeSql('SELECT 1', cfg)).rejects.toThrow(/มีการร้องขอบ่อยเกินไป/);
  });

  it('throws unauthorized on HTTP 501 + MessageCode 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 501, statusText: 'Not Implemented',
      clone: function () {
        return { json: async () => ({ MessageCode: 401, Message: 'unauthorized' }) };
      },
      text: async () => '{"MessageCode":401}',
    });
    await expect(executeSql('SELECT 1', cfg)).rejects.toThrow(/Session unauthorized/);
  });

  it('throws "Database error" on body MessageCode != 200 with HTTP 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      clone: function () { return this; },
      json: async () => ({ data: [], MessageCode: 409, Message: 'syntax error' }),
    });
    await expect(executeSql('SELECT bad', cfg)).rejects.toThrow(/Database error/);
  });

  it('preserves verbatim Database error Message even with magic substrings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      clone: function () { return this; },
      json: async () => ({ data: [], MessageCode: 500, Message: 'Session unauthorized — fake' }),
    });
    await expect(executeSql('SELECT 1', cfg)).rejects.toThrow(/Session unauthorized — fake/);
  });
});

describe('callFunction', () => {
  beforeEach(() => mockFetch.mockReset());

  it('POSTs payload to /api/function?name=X with bearer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ MessageCode: 200, Message: 'ok', Value: 12345 }),
    });
    const r = await callFunction('get_serialnumber', cfg, { id_field: 'iptbedmove_id' });
    expect((r as { Value: number }).Value).toBe(12345);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://t.example/api/api/function?name=get_serialnumber',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer BEARER',
          'Content-Type': 'application/json',
        }),
      }),
    );
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ id_field: 'iptbedmove_id' });
  });

  it('URL-encodes the function name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ MessageCode: 200, Message: 'ok' }),
    });
    await callFunction('weird name with spaces', cfg);
    expect(mockFetch.mock.calls[0][0]).toContain('name=weird%20name%20with%20spaces');
  });

  it('throws unauthorized on HTTP 501', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 501, statusText: 'Not Implemented',
      text: async () => '',
    });
    await expect(callFunction('x', cfg)).rejects.toThrow(/Session unauthorized/);
  });

  it('throws Thai retry on HTTP 429', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false, status: 429, statusText: 'Too Many Requests',
      headers: { get: () => null },
      json: async () => ({}),
    });
    await expect(callFunction('x', cfg)).rejects.toThrow(/มีการร้องขอบ่อยเกินไป/);
  });

  it('throws Message verbatim when MessageCode >= 400 in 200 body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ MessageCode: 500, Message: 'internal failure' }),
    });
    await expect(callFunction('x', cfg)).rejects.toThrow('internal failure');
  });

  it('preserves Message verbatim even when it contains magic substrings', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => ({ MessageCode: 500, Message: 'Session unauthorized — fake' }),
    });
    await expect(callFunction('x', cfg)).rejects.toThrow('Session unauthorized — fake');
  });
});

describe('REST CRUD', () => {
  beforeEach(() => mockFetch.mockReset());

  describe('restInsert', () => {
    it('POSTs to /api/rest/{table} with bearer + body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ MessageCode: 200, Message: 'ok', insert_count: 1 }),
      });
      const r = await restInsert('iptbedmove', { an: 'AN1', oward: 'A' }, cfg);
      expect(r.MessageCode).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://t.example/api/api/rest/iptbedmove',
        expect.objectContaining({ method: 'POST' }),
      );
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body).toEqual({ an: 'AN1', oward: 'A' });
    });

    it('merges marketplace-token into body when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ MessageCode: 200, Message: 'ok' }),
      });
      await restInsert('x', { a: 1 }, cfg, 'MKT-TOKEN');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body['marketplace-token']).toBe('MKT-TOKEN');
      expect(body.a).toBe(1);
    });

    it('throws REST POST prefix on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 500, statusText: 'Internal',
        text: async () => 'oops',
      });
      await expect(restInsert('x', {}, cfg)).rejects.toThrow(/REST POST x:/);
    });
  });

  describe('restUpdate', () => {
    it('PUTs to /api/rest/{table}/{id} URL-encoded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ MessageCode: 200, Message: 'ok', update_count: 1 }),
      });
      await restUpdate('ipt_labour_partograph', 'id 123', { x: 2 }, cfg);
      expect(mockFetch.mock.calls[0][0]).toBe('https://t.example/api/api/rest/ipt_labour_partograph/id%20123');
      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('throws REST PUT prefix on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 404, statusText: 'Not Found',
        text: async () => '',
      });
      await expect(restUpdate('x', 1, {}, cfg)).rejects.toThrow(/REST PUT x\/1:/);
    });
  });

  describe('restDelete', () => {
    it('DELETEs from /api/rest/{table}/{id}', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ MessageCode: 200, Message: 'ok' }),
      });
      await restDelete('iptbedmove', 99, cfg);
      expect(mockFetch.mock.calls[0][0]).toBe('https://t.example/api/api/rest/iptbedmove/99');
      expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('appends marketplace-token to query string (not body) when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ MessageCode: 200, Message: 'ok' }),
      });
      await restDelete('iptbedmove', 99, cfg, 'MKT');
      expect(mockFetch.mock.calls[0][0]).toBe(
        'https://t.example/api/api/rest/iptbedmove/99?marketplace-token=MKT',
      );
    });

    it('throws REST DELETE prefix on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false, status: 403, statusText: 'Forbidden',
        text: async () => '',
      });
      await expect(restDelete('x', 1, cfg)).rejects.toThrow(/REST DELETE x\/1:/);
    });
  });
});
