// Playwright fixture that intercepts the BMS PasteJSON session-retrieval
// endpoint and returns a fake session pointing at an in-process mock server
// (typically created by createMockBmsServer). Use BEFORE navigating the page
// so the browser-direct BMS client (src/lib/bms-browser-client.ts) hits the
// mock instead of the real hosxp.net tunnel during E2E tests.

import type { Page } from '@playwright/test';

export interface MockBmsSessionRetrieveOptions {
  /** Mock BMS API base URL — typically the .url from createMockBmsServer */
  apiUrl: string;
  /** Bearer token returned in the session response (default 'mock-bearer') */
  bearerToken?: string;
  /** loginname in user_info (default 'nurse1') */
  loginname?: string;
  /** fullname in user_info (default 'Nurse One') */
  fullname?: string;
  /** hospcode in user_info (default '10670') */
  hospcode?: string;
}

const PASTE_JSON_URL = 'https://hosxp.net/phapi/PasteJSON';

/**
 * Install a route interceptor on the given Playwright page that responds to
 * `https://hosxp.net/phapi/PasteJSON` with a fake BMS session response
 * pointing at the supplied apiUrl.
 *
 * Call this BEFORE navigating the page; subsequent retrieveBmsSession() calls
 * in the page will hit the mock instead of the real PasteJSON endpoint.
 */
export async function mockBmsSessionRetrieve(
  page: Page,
  opts: MockBmsSessionRetrieveOptions,
): Promise<void> {
  const bearer = opts.bearerToken ?? 'mock-bearer';
  // Real PasteJSON shape (verified live): connection details nest under
  // result.user_info; bms_session_code is the bearer (key_value as fallback).
  const body = {
    result: {
      user_info: {
        bms_url: opts.apiUrl,
        bms_session_code: bearer,
        loginname: opts.loginname ?? 'nurse1',
        fullname: opts.fullname ?? 'Nurse One',
        hospcode: opts.hospcode ?? '10670',
      },
      key_value: bearer,
      expired_second: 3600,
    },
    MessageCode: 200,
    Message: 'OK',
  };

  // retrieveBmsSession appends ?Action=GET&code=<sid>&_=<ts>; match the URL
  // by prefix (Playwright's route matcher accepts a regexp).
  await page.route(new RegExp(`^${PASTE_JSON_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
