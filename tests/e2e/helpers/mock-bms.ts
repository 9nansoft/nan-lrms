// tests/e2e/helpers/mock-bms.ts
// Mocks the browser-direct HOSxP path for the ward board: PasteJSON session
// retrieval, the BMS /api/sql endpoint (first matching SQL substring wins,
// anything else returns []), the local-gateway probe (aborted so the app keeps
// the mock URL), and browser-push (stubbed so mocked rows never reach the
// synthetic DB). Every hit is logged for the debug attachment.
import type { Page, Route } from '@playwright/test';

export const MOCK_BMS_URL = 'https://bms-mock.e2e.invalid';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

export interface MockBmsOptions {
  sql: Array<[string, unknown[]]>;
  /** SQL substrings answered with this HTTP status instead of rows (checked before `sql`). */
  failSql?: Array<[string, number]>;
  omitBmsUrl?: boolean;
  log: string[];
}

export async function mockBms(page: Page, opts: MockBmsOptions): Promise<void> {
  await page.route('https://hosxp.net/phapi/PasteJSON**', (route) => {
    const user_info: Record<string, unknown> = {
      bms_session_code: 'e2e-bearer',
      loginname: 'e2e-nurse',
      fullname: 'E2E Nurse',
      hospcode: '10670',
    };
    if (!opts.omitBmsUrl) user_info.bms_url = MOCK_BMS_URL;
    opts.log.push(`mock-bms: PasteJSON (bms_url ${opts.omitBmsUrl ? 'omitted' : 'set'})`);
    return route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ result: { user_info, key_value: 'e2e-bearer', expired_second: 3600 }, MessageCode: 200, Message: 'OK' }),
    });
  });
  await page.route('http://127.0.0.1:45011/**', (route) => route.abort());
  await page.route(`${MOCK_BMS_URL}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path === '/api/sql') {
      const sql = String((req.postDataJSON() as { sql?: string } | null)?.sql ?? '');
      const failure = opts.failSql?.find(([m]) => sql.includes(m));
      if (failure) {
        opts.log.push(`mock-bms: sql "${failure[0]}" → HTTP ${failure[1]} (injected failure)`);
        return route.fulfill({
          status: failure[1],
          headers: CORS,
          contentType: 'application/json',
          body: JSON.stringify({ MessageCode: failure[1], Message: 'injected failure (e2e)' }),
        });
      }
      const hit = opts.sql.find(([m]) => sql.includes(m));
      opts.log.push(`mock-bms: sql ${hit ? `"${hit[0]}" → ${hit[1].length} rows` : `unmatched: ${sql.slice(0, 60)}`}`);
      return route.fulfill({
        status: 200,
        headers: CORS,
        contentType: 'application/json',
        body: JSON.stringify({ data: hit?.[1] ?? [], MessageCode: 200, Message: 'ok' }),
      });
    }
    opts.log.push(`mock-bms: ${req.method()} ${path}`);
    return route.fulfill({
      status: 200,
      headers: CORS,
      contentType: 'application/json',
      body: JSON.stringify({ MessageCode: 200, Message: 'ok', Value: 0 }),
    });
  });
  await page.route('**/api/sync/browser-push**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
}
