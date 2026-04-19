import { describe, it, expectTypeOf } from 'vitest';
import type {
  ConnectionConfig,
  UserInfo,
  BmsSessionResponse,
  SqlApiResponse,
  RestApiResponse,
  BmsFunctionResponse,
  SqlParams,
} from '@/types/bms-browser';

describe('bms-browser types', () => {
  it('ConnectionConfig has required fields', () => {
    const c: ConnectionConfig = {
      apiUrl: 'https://x',
      bearerToken: 't',
      appIdentifier: 'KK-LRMS.Web',
    };
    expectTypeOf(c.apiUrl).toBeString();
  });
  it('SqlApiResponse exposes data array + MessageCode', () => {
    const r: SqlApiResponse = { data: [], MessageCode: 200, Message: 'ok' };
    expectTypeOf(r.data).toBeArray();
  });
});
