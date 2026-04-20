import { describe, it, expect } from 'vitest';
import { mockBmsSessionRetrieve } from '../../helpers/mockBmsSessionRetrieve';

interface FulfillCall {
  status: number;
  contentType: string;
  body: string;
}

interface RouteStub {
  fulfill: (init: FulfillCall) => Promise<void>;
}

type RouteHandler = (route: RouteStub) => Promise<void>;

interface PageStubResult {
  page: Parameters<typeof mockBmsSessionRetrieve>[0];
  getCapturedUrl: () => string | RegExp | null;
  fireRoute: () => Promise<FulfillCall | null>;
}

function makePageStub(): PageStubResult {
  let capturedUrl: string | RegExp | null = null;
  let capturedHandler: RouteHandler | null = null;
  const fulfilled: FulfillCall[] = [];

  const page = {
    route: async (url: string | RegExp, handler: RouteHandler) => {
      capturedUrl = url;
      capturedHandler = handler;
    },
  };

  return {
    page: page as never,
    getCapturedUrl: () => capturedUrl,
    fireRoute: async () => {
      if (!capturedHandler) return null;
      await capturedHandler({
        fulfill: async (init) => {
          fulfilled.push(init);
        },
      });
      return fulfilled[fulfilled.length - 1] ?? null;
    },
  };
}

describe('mockBmsSessionRetrieve', () => {
  it('routes the PasteJSON URL and fulfills with default user info nested under result.user_info', async () => {
    const stub = makePageStub();
    await mockBmsSessionRetrieve(stub.page, { apiUrl: 'http://127.0.0.1:9999' });
    // URL pattern is now a regex (matches PasteJSON with optional ?Action=GET&code=…)
    const captured = stub.getCapturedUrl();
    if (captured instanceof RegExp) {
      expect('https://hosxp.net/phapi/PasteJSON?Action=GET&code=X').toMatch(captured);
    } else {
      expect(captured).toBe('https://hosxp.net/phapi/PasteJSON');
    }
    const result = await stub.fireRoute();
    expect(result?.status).toBe(200);
    expect(result?.contentType).toBe('application/json');
    const body = JSON.parse(result!.body);
    // Real PasteJSON shape: result.user_info.bms_url + result.user_info.bms_session_code
    expect(body.result.user_info.bms_url).toBe('http://127.0.0.1:9999');
    expect(body.result.user_info.bms_session_code).toBe('mock-bearer');
    expect(body.result.user_info.loginname).toBe('nurse1');
    expect(body.result.user_info.hospcode).toBe('10670');
    expect(body.result.key_value).toBe('mock-bearer');
    expect(body.MessageCode).toBe(200);
  });

  it('overrides user fields when provided', async () => {
    const stub = makePageStub();
    await mockBmsSessionRetrieve(stub.page, {
      apiUrl: 'http://x',
      bearerToken: 'CUSTOM',
      loginname: 'doc1',
      fullname: 'Dr. One',
      hospcode: '99999',
    });
    const result = await stub.fireRoute();
    const body = JSON.parse(result!.body);
    expect(body.result.user_info.bms_session_code).toBe('CUSTOM');
    expect(body.result.user_info).toMatchObject({
      loginname: 'doc1',
      fullname: 'Dr. One',
      hospcode: '99999',
    });
  });
});
