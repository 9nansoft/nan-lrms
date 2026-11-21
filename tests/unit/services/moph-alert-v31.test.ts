// TDD (Red→Green) for the MOPH Alert Free Form API v3.1 sender.
// Pins the wire contract from docs/API MOPH Alert Free Form version 3.1
// .postman_collection.json + docs/API Alert Free Form JSON 3.1.pdf:
//   POST {{prod}}/alert/v3.1/messages
//   headers: client-key + secret-key (static — no Bearer session)
//   body: { cid: string[], messages: LINE-message-objects (≤5),
//           message_title?, message_html?, message_text?, message_type? }
//   documented response: { message, message_code } — 200 ok / 401 bad keys /
//   "No Cid", in the BODY regardless of the HTTP status.
// The static key pair is issued per hospital app by MOPH → env-configured;
// unset keys are a terminal misconfiguration (mophFreeFormConfigured=false).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { sendMophFreeFormAlert, type MophFreeFormAlertResponse } from '@/services/moph-alert-v31';
import { mophFreeFormConfigured } from '@/config/moph-alert-config';

// ---- helpers --------------------------------------------------------------
const CID_13 = '3320500282121'; // synthetic 13-digit placeholder

/** A spec-valid LINE flex message — the shape real alerts send. */
const FLEX_MESSAGE = {
  type: 'flex',
  altText: 'แจ้งเตือนกรณีเสี่ยงสูง — รพ.ทดสอบ',
  contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: [] } },
};

const BASE_INPUT = {
  cid: CID_13,
  messages: [FLEX_MESSAGE],
  messageTitle: 'แจ้งเตือนกรณีเสี่ยงสูง — รพ.ทดสอบ',
  messageHtml: '<div><strong>แจ้งเตือนกรณีเสี่ยงสูง</strong></div>',
  messageText: 'แจ้งเตือนกรณีเสี่ยงสูง',
};

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
  delete process.env.MOPH_ALERT_MESSAGE_TYPE;
}

// ---- tests ----------------------------------------------------------------
describe('sendMophFreeFormAlert', () => {
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
      'MOPH_ALERT_MESSAGE_TYPE',
      'MOPH_MAX_502_RETRIES',
      'MOPH_RETRY_BACKOFF_MS',
    ]) {
      delete process.env[k];
    }
  });

  it('sends a POST with client-key/secret-key headers and the free-form body', async () => {
    const { calls } = mockFetchSeq([jsonResponse(200, { message: 'Success', message_code: 200 })]);

    const res = await sendMophFreeFormAlert(BASE_INPUT);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://alert.test/alert/v3.1/messages');
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers['client-key']).toBe('ck-test');
    expect(headers['secret-key']).toBe('sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    // Static keys — no Bearer session on this transport.
    expect(headers.Authorization).toBeUndefined();

    const body = JSON.parse(calls[0].init.body as string);
    // cid is the API's array type, but carries exactly ONE recipient — the
    // pipeline is a per-recipient audit (one moph_alert_log row per send).
    expect(body.cid).toEqual([CID_13]);
    expect(body.messages).toEqual([FLEX_MESSAGE]);
    expect(body.message_title).toBe(BASE_INPUT.messageTitle);
    expect(body.message_html).toBe(BASE_INPUT.messageHtml);
    expect(body.message_text).toBe(BASE_INPUT.messageText);
    expect(body.message_type).toBe('HPT'); // collection default

    expect(res.success).toBe(true);
    expect(res.messageId).toBeNull();
    expect(res.reason).toBeNull();
  });

  it('omits the optional app-inbox fields when not provided', async () => {
    const { calls } = mockFetchSeq([jsonResponse(200, { message: 'Success', message_code: 200 })]);
    await sendMophFreeFormAlert({ cid: CID_13, messages: [FLEX_MESSAGE] });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.cid).toEqual([CID_13]);
    expect(body.messages).toEqual([FLEX_MESSAGE]);
    expect(body.message_type).toBe('HPT');
    expect(body.message_title).toBeUndefined();
    expect(body.message_html).toBeUndefined();
    expect(body.message_text).toBeUndefined();
  });

  it('uses MOPH_ALERT_MESSAGE_TYPE when set', async () => {
    process.env.MOPH_ALERT_MESSAGE_TYPE = 'XYZ';
    const { calls } = mockFetchSeq([jsonResponse(200, { message: 'Success', message_code: 200 })]);
    await sendMophFreeFormAlert({ cid: CID_13, messages: [FLEX_MESSAGE] });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.message_type).toBe('XYZ');
  });

  it('validates cid is exactly 13 digits before calling fetch', async () => {
    mockFetchSeq([jsonResponse(200, { message: 'Success', message_code: 200 })]);
    await expect(
      sendMophFreeFormAlert({ ...BASE_INPUT, cid: '123' }),
    ).rejects.toMatchObject({ code: 'INVALID_CID' });
    await expect(
      sendMophFreeFormAlert({ ...BASE_INPUT, cid: '12345678901234' }),
    ).rejects.toMatchObject({ code: 'INVALID_CID' });
  });

  it('validates messages is a non-empty array of at most 5', async () => {
    mockFetchSeq([jsonResponse(200, { message: 'Success', message_code: 200 })]);
    await expect(
      sendMophFreeFormAlert({ cid: CID_13, messages: [] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(
      sendMophFreeFormAlert({ cid: CID_13, messages: [1, 2, 3, 4, 5, 6] }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
    // Exactly 5 — the PDF's cap — passes.
    const res = await sendMophFreeFormAlert({
      cid: CID_13,
      messages: [{ type: 'text', text: 'x' }, 2, 3, 4, 5].map(() => FLEX_MESSAGE),
    });
    expect(res.success).toBe(true);
  });

  it('maps 401 → AUTH error (non-retryable)', async () => {
    mockFetchSeq([jsonResponse(401, { message: 'invalid client-key' })]);
    await expect(sendMophFreeFormAlert(BASE_INPUT)).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('maps 422 → VALIDATION error (non-retryable)', async () => {
    mockFetchSeq([jsonResponse(422, { message: 'messages validation failed' })]);
    await expect(sendMophFreeFormAlert(BASE_INPUT)).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('retries only on 5xx with backoff, then gives up as RETRYABLE_EXHAUSTED', async () => {
    const { calls } = mockFetchSeq([
      jsonResponse(502, {}),
      jsonResponse(502, {}),
      jsonResponse(502, {}),
    ]);
    const p = sendMophFreeFormAlert(BASE_INPUT);
    const expectation = expect(p).rejects.toMatchObject({ code: 'RETRYABLE_EXHAUSTED' });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
    expect(calls).toHaveLength(3); // 1 + 2 retries
  });

  it('succeeds after a transient 502', async () => {
    mockFetchSeq([
      jsonResponse(502, {}),
      jsonResponse(200, { message: 'Success', message_code: 200, message_id: 'm2' }),
    ]);
    const p = sendMophFreeFormAlert(BASE_INPUT).then((r) => r);
    await vi.advanceTimersByTimeAsync(1000);
    const res: MophFreeFormAlertResponse = await p;
    expect(res.messageId).toBe('m2');
    expect(res.success).toBe(true);
  });

  it('does not retry on 400 (terminal CLIENT_ERROR)', async () => {
    const { calls } = mockFetchSeq([jsonResponse(400, { message: 'bad cid' })]);
    await expect(sendMophFreeFormAlert(BASE_INPUT)).rejects.toMatchObject({
      code: 'CLIENT_ERROR',
    });
    expect(calls).toHaveLength(1);
  });

  it('accepts any 2xx as success and extracts the message id defensively', async () => {
    for (const [status, raw, expectedId] of [
      [200, { message: 'Success', message_code: 200 }, null],
      [201, { message_id: 'a' }, 'a'],
      [202, { data: { message_id: 'b' } }, 'b'],
      [200, { id: 'c' }, 'c'],
      [200, {}, null],
      [200, { MessageCode: 200, Message: 'OK' }, null],
      // Explicit failure flag in the body → not a success even on 2xx.
      [200, { success: false }, null],
    ] as const) {
      mockFetchSeq([jsonResponse(status, raw)]);
      const res = await sendMophFreeFormAlert(BASE_INPUT);
      expect(res.messageId).toBe(expectedId);
      expect(res.success).toBe(expectedId !== null ? true : raw.success !== false);
    }
  });

  it('treats the documented message_code ≠ 200 envelope as failure with its message', async () => {
    // The PDF documents 401-in-body shapes: a non-200 message_code means the
    // send was rejected even though the HTTP layer succeeded (the
    // "ส่งสำเร็จ but nothing delivered" trap).
    mockFetchSeq([
      jsonResponse(200, {
        message_code: 401,
        message: 'client-key or secret-key incorrect',
      }),
    ]);
    const res = await sendMophFreeFormAlert(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('client-key or secret-key incorrect');
    expect(res.messageId).toBeNull();

    mockFetchSeq([jsonResponse(200, { message_code: 401, message: 'No Cid' })]);
    const res2 = await sendMophFreeFormAlert(BASE_INPUT);
    expect(res2.success).toBe(false);
    expect(res2.reason).toBe('No Cid');
  });

  it('treats line_message "Error template" as failure even with message_code 200', async () => {
    // Defensive carry-over from the template endpoint: a body that literally
    // says this is never a delivered message.
    mockFetchSeq([
      jsonResponse(200, {
        app_message: '',
        line_message: 'Error template',
        message_code: 200,
      }),
    ]);
    const res = await sendMophFreeFormAlert(BASE_INPUT);
    expect(res.success).toBe(false);
    expect(res.reason).toContain('Error template');
    expect(res.messageId).toBeNull();
  });
});

describe('mophFreeFormConfigured', () => {
  const ENV_KEYS = ['MOPH_ALERT_CLIENT_KEY', 'MOPH_ALERT_SECRET_KEY'] as const;
  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it('is true when the key pair is set — no template name required anymore', () => {
    process.env.MOPH_ALERT_CLIENT_KEY = 'ck';
    process.env.MOPH_ALERT_SECRET_KEY = 'sk';
    expect(mophFreeFormConfigured()).toBe(true);

    process.env.MOPH_ALERT_SECRET_KEY = '';
    expect(mophFreeFormConfigured()).toBe(false); // secret missing

    process.env.MOPH_ALERT_SECRET_KEY = 'sk';
    process.env.MOPH_ALERT_CLIENT_KEY = '';
    expect(mophFreeFormConfigured()).toBe(false); // client key missing
  });

  it('is false when nothing is configured', () => {
    expect(mophFreeFormConfigured()).toBe(false);
  });
});
