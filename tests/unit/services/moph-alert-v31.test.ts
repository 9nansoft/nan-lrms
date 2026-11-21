// TDD (Red→Green) for the MOPH Alert Template API v3.1 sender.
// Pins the wire contract from docs/API MOPH Alert Template V3.1.postman_collection.json:
//   POST {{prod}}/alert/v3.1/template
//   headers: client-key + secret-key (static — no Bearer session)
//   body: { cid, name, template, header, message_title, message_html,
//           message_text, message_type, url?, message_confirm_url?, message_datetime? }
// The registered `template` name is MOPH-approved per app → env-configured;
// unset config is a terminal misconfiguration (mophTemplateConfigured=false).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendMophTemplateAlert, type MophTemplateAlertResponse } from '@/services/moph-alert-v31';
import { mophTemplateConfigured } from '@/config/moph-alert-config';

// ---- helpers --------------------------------------------------------------
const CID_13 = '3320500282121'; // synthetic 13-digit placeholder

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Captures every fetch call's (url, init) so tests assert wire shape. */
function mockFetchSeq(responses: Response[]): {
  calls: { url: string; init: RequestInit }[];
} {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push({ url: _url, init: init ?? {} });
      return responses[Math.min(i++, responses.length - 1)];
    }),
  );
  return { calls };
}

function setConfigEnv(): void {
  process.env.MOPH_ALERT_API_URL = 'https://alert.test';
  process.env.MOPH_ALERT_CLIENT_KEY = 'ck-test';
  process.env.MOPH_ALERT_SECRET_KEY = 'sk-test';
  process.env.MOPH_ALERT_TEMPLATE = 'แจ้งเตือนLRMS';
  delete process.env.MOPH_ALERT_HEADER;
  delete process.env.MOPH_ALERT_MESSAGE_TYPE;
}

const BASE_INPUT = {
  cid: CID_13,
  name: 'ดร. ทดสอบ',
  messageTitle: 'แจ้งเตือนกรณีเสี่ยงสูง — รพ.ทดสอบ',
  messageHtml: '<div><strong>แจ้งเตือนกรณีเสี่ยงสูง</strong></div>',
  messageText: 'แจ้งเตือนกรณีเสี่ยงสูง',
};

// ---- tests ----------------------------------------------------------------
describe('sendMophTemplateAlert', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setConfigEnv();
    process.env.MOPH_MAX_502_RETRIES = '2';
    process.env.MOPH_RETRY_BACKOFF_MS = '10';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const k of [
      'MOPH_ALERT_API_URL',
      'MOPH_ALERT_CLIENT_KEY',
      'MOPH_ALERT_SECRET_KEY',
      'MOPH_ALERT_TEMPLATE',
      'MOPH_ALERT_HEADER',
      'MOPH_ALERT_MESSAGE_TYPE',
      'MOPH_MAX_502_RETRIES',
      'MOPH_RETRY_BACKOFF_MS',
    ]) {
      delete process.env[k];
    }
  });

  it('sends a POST with client-key/secret-key headers and the template body', async () => {
    const { calls } = mockFetchSeq([jsonResponse(200, { message_id: 'msg-1' })]);

    const res = await sendMophTemplateAlert(BASE_INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://alert.test/alert/v3.1/template');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['client-key']).toBe('ck-test');
    expect(headers['secret-key']).toBe('sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    // Static keys — no Bearer session on this transport.
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(calls[0].init.body as string);
    expect(body.cid).toBe(CID_13);
    expect(body.name).toBe('ดร. ทดสอบ');
    expect(body.template).toBe('แจ้งเตือนLRMS');
    expect(body.header).toBe('แจ้งเตือนLRMS'); // header falls back to template
    expect(body.message_title).toBe(BASE_INPUT.messageTitle);
    expect(body.message_html).toBe(BASE_INPUT.messageHtml);
    expect(body.message_text).toBe(BASE_INPUT.messageText);
    expect(body.message_type).toBe('HPT'); // collection default
    // Optional fields absent when not provided.
    expect(body.url).toBeUndefined();
    expect(body.message_confirm_url).toBeUndefined();
    expect(body.message_datetime).toBeUndefined();

    expect(res.success).toBe(true);
    expect(res.messageId).toBe('msg-1');
  });

  it('includes url / message_confirm_url / message_datetime when provided', async () => {
    const { calls } = mockFetchSeq([jsonResponse(200, { message_id: 'm' })]);
    await sendMophTemplateAlert({
      ...BASE_INPUT,
      confirmUrl: 'https://app/case/1',
      messageDatetime: '2026-11-21T03:00:00.000Z',
    });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.url).toBe('https://app/case/1');
    expect(body.message_confirm_url).toBe('https://app/case/1');
    expect(body.message_datetime).toBe('2026-11-21T03:00:00.000Z');
  });

  it('uses MOPH_ALERT_HEADER for header when set separately from template', async () => {
    process.env.MOPH_ALERT_HEADER = 'หัวข้อเฉพาะ';
    const { calls } = mockFetchSeq([jsonResponse(200, {})]);
    await sendMophTemplateAlert(BASE_INPUT);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.template).toBe('แจ้งเตือนLRMS');
    expect(body.header).toBe('หัวข้อเฉพาะ');
  });

  it('validates cid is exactly 13 digits before calling fetch', async () => {
    mockFetchSeq([jsonResponse(200, {})]);
    await expect(
      sendMophTemplateAlert({ ...BASE_INPUT, cid: '123' }),
    ).rejects.toMatchObject({ code: 'INVALID_CID' });
    await expect(
      sendMophTemplateAlert({ ...BASE_INPUT, cid: '12345678901234' }),
    ).rejects.toMatchObject({ code: 'INVALID_CID' });
  });

  it('maps 401 → AUTH error (non-retryable)', async () => {
    mockFetchSeq([jsonResponse(401, { message: 'invalid client-key' })]);
    await expect(sendMophTemplateAlert(BASE_INPUT)).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('maps 422 → VALIDATION error (non-retryable)', async () => {
    mockFetchSeq([jsonResponse(422, { message: 'template not found' })]);
    await expect(sendMophTemplateAlert(BASE_INPUT)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('retries only on 5xx with backoff, then gives up as RETRYABLE_EXHAUSTED', async () => {
    const { calls } = mockFetchSeq([
      jsonResponse(502, {}),
      jsonResponse(502, {}),
      jsonResponse(502, {}),
    ]);
    const p = sendMophTemplateAlert(BASE_INPUT);
    const expectation = expect(p).rejects.toMatchObject({ code: 'RETRYABLE_EXHAUSTED' });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    expect(calls).toHaveLength(3); // 1 + 2 retries
  });

  it('succeeds after a transient 502', async () => {
    mockFetchSeq([jsonResponse(502, {}), jsonResponse(200, { message_id: 'm2' })]);
    const p = sendMophTemplateAlert(BASE_INPUT).then((r) => r);
    await vi.advanceTimersByTimeAsync(1000);
    const res: MophTemplateAlertResponse = await p;
    expect(res.messageId).toBe('m2');
  });

  it('does not retry on 400 (terminal CLIENT_ERROR)', async () => {
    const { calls } = mockFetchSeq([jsonResponse(400, { message: 'bad cid' })]);
    await expect(sendMophTemplateAlert(BASE_INPUT)).rejects.toMatchObject({ code: 'CLIENT_ERROR' });
    expect(calls).toHaveLength(1);
  });

  it('accepts any 2xx as success and extracts the message id defensively', async () => {
    for (const [status, raw, expectedId] of [
      [200, { message_id: 'a' }, 'a'],
      [201, { data: { message_id: 'b' } }, 'b'],
      [202, { id: 'c' }, 'c'],
      [200, {}, null],
      [200, { MessageCode: 200, Message: 'OK' }, null],
      // Explicit failure flag in the body → not a success even on 2xx.
      [200, { success: false }, null],
    ] as const) {
      mockFetchSeq([jsonResponse(status, raw)]);
      const res = await sendMophTemplateAlert(BASE_INPUT);
      expect(res.messageId).toBe(expectedId);
      expect(res.success).toBe(expectedId !== null ? true : raw.success !== false);
    }
  });

  it('treats a BMS-style MessageCode ≠ 200 envelope as failure with its Message', async () => {
    // hosxp.net/bmscloud endpoints return {MessageCode, Message} on HTTP 200 —
    // a non-200 code means the template/cid was rejected even though the HTTP
    // layer succeeded (the "ส่งสำเร็จ but nothing delivered" trap).
    mockFetchSeq([
      jsonResponse(200, { MessageCode: 400, Message: 'template not found', message_id: null }),
    ]);
    const res = await sendMophTemplateAlert(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('template not found');
    expect(res.messageId).toBeNull();
  });

  it('treats the v3.1 lowercase message_code ≠ 200 envelope as failure', async () => {
    // The live v3.1 endpoint's own envelope is lowercase {app_message,
    // line_message, message_code} — a non-200 code there is the same trap as
    // the PascalCase BMS one and must not pass as success.
    mockFetchSeq([jsonResponse(200, { app_message: '', line_message: '', message_code: 400 })]);
    const res = await sendMophTemplateAlert(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('message_code 400');
    expect(res.messageId).toBeNull();
  });

  it('treats line_message "Error template" as failure even with message_code 200', async () => {
    // Observed live body: MOPH accepts the request (message_code 200) but its
    // template render failed and it substitutes the sentinel line_message
    // "Error template" — nothing usable reaches LINE. Must NOT count as sent.
    mockFetchSeq([
      jsonResponse(200, {
        app_message: '',
        line_message: 'Error template',
        message_code: 200,
      }),
    ]);
    const res = await sendMophTemplateAlert(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('Error template');
    expect(res.messageId).toBeNull();
  });

  it('still succeeds on the v3.1 envelope when line_message carries real content', async () => {
    // Guard against over-flagging: a rendered line_message (any real text) with
    // message_code 200 is a genuine success, not the sentinel.
    mockFetchSeq([
      jsonResponse(200, {
        app_message: '',
        line_message: 'แจ้งเตือนกรณีเสี่ยงสูง — รพ.ทดสอบ',
        message_code: 200,
      }),
    ]);
    const res = await sendMophTemplateAlert(BASE_INPUT);
    expect(res.success).toBe(true);
    expect(res.reason).toBeNull();
  });
});

describe('mophTemplateConfigured', () => {
  const ENV_KEYS = [
    'MOPH_ALERT_CLIENT_KEY',
    'MOPH_ALERT_SECRET_KEY',
    'MOPH_ALERT_TEMPLATE',
  ] as const;
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('is true only when keys AND template are all set', () => {
    process.env.MOPH_ALERT_CLIENT_KEY = 'ck';
    process.env.MOPH_ALERT_SECRET_KEY = 'sk';
    process.env.MOPH_ALERT_TEMPLATE = 'แจ้งเตือนLRMS';
    expect(mophTemplateConfigured()).toBe(true);

    process.env.MOPH_ALERT_TEMPLATE = '';
    expect(mophTemplateConfigured()).toBe(false); // template name missing

    process.env.MOPH_ALERT_TEMPLATE = 'แจ้งเตือนLRMS';
    process.env.MOPH_ALERT_SECRET_KEY = '';
    expect(mophTemplateConfigured()).toBe(false); // secret missing
  });

  it('is false when nothing is configured', () => {
    expect(mophTemplateConfigured()).toBe(false);
  });
});
