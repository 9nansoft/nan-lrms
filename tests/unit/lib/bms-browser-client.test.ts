import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  retrieveBmsSession,
  extractConnectionConfig,
  extractUserInfo,
  APP_IDENTIFIER,
} from '@/lib/bms-browser-client';

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
