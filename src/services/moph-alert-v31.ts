// MOPH Alert Free Form API v3.1 sender client (LINE notify via morpromt2c).
//
// Thin typed wrapper around the free-form endpoint (wire contract from
// docs/API MOPH Alert Free Form version 3.1.postman_collection.json and
// docs/API Alert Free Form JSON 3.1.pdf):
//   POST <origin>/alert/v3.1/messages
//   headers: client-key + secret-key  (static credentials — NO Bearer session)
//   body: { cid: string[], messages: LINE-message-objects (max 5 bubbles),
//           message_title?, message_html?, message_text?, message_type? }
//   documented response: { message, message_code } — 200 ok, 401 bad keys /
//   "No Cid" (in the BODY — check message_code even on HTTP 2xx).
// This replaces the earlier registered-template endpoint (/alert/v3.1/template,
// docs/API MOPH Alert Template V3.1.postman_collection.json — kept for
// history): the free-form API needs NO MOPH-registered template, which removes
// the "Error template" render failure that transport never escaped. The keys
// are issued by MOPH per app and are therefore env-configured
// (moph-alert-config.ts) — never hardcoded.
//
// `cid` stays a single string in the interface even though the API accepts an
// array: the alert pipeline is a per-recipient audit (one moph_alert_log row
// per recipient), so one wire call carries exactly one recipient and the body
// array-wraps it. The `messages` array is caller-built LINE Messaging API
// content — a flex bubble for real alerts (buildAlertFlex + {type:'flex'}
// wrapper at the call site), so URL buttons live INSIDE the message instead of
// the template API's url/message_confirm_url fields.
//
// Retry policy mirrors sendMophPrompt (moph-prompt.ts): 5xx/timeouts retry with
// exponential backoff up to MOPH_MAX_502_RETRIES; 4xx is terminal. The error
// type and codes are REUSED from moph-prompt so the drain's send/finalize path
// is transport-agnostic (it duck-types on `.code`).
//
// This module performs NO audit write — the authoritative per-recipient record
// lives in moph_alert_log (same rule as moph-prompt.ts: no dual-audit).

import { logger } from '@/lib/logger';
import {
  mophAlertApiUrl,
  mophAlertKeys,
  mophAlertMessageType,
  mophAlertLimits,
} from '@/config/moph-alert-config';
import { isValidCid, MophPromptError } from '@/services/moph-prompt';

export interface SendMophFreeFormAlertInput {
  /** Recipient Thai Citizen ID — exactly 13 digits, validated before send.
   *  Wire body wraps it as the single element of the API's cid array. */
  cid: string;
  /** LINE Messaging API message objects (≤5) — the alert's actual content.
   *  Real alerts send one {type:'flex', altText, contents} bubble; any
   *  spec-valid message object ({type:'text',...} included) passes through. */
  messages: unknown[];
  /** Title for the หมอพร้อม app inbox (message_title — optional per spec). */
  messageTitle?: string;
  /** HTML body for the app inbox (message_html — optional per spec). */
  messageHtml?: string;
  /** Plain text / inbox list-item name (message_text — optional per spec). */
  messageText?: string;
}

export interface MophFreeFormAlertResponse {
  /** Provider message id, when the response carries one. */
  messageId: string | null;
  /** True when the API accepted the send (2xx, no explicit failure flag). */
  success: boolean;
  /** Provider's own failure reason when success=false — shown to the tester. */
  reason: string | null;
}

interface RawMessagesResponse {
  message_id?: string | null;
  id?: string | null;
  data?: { message_id?: string | null } | null;
  success?: boolean;
  status?: string;
  message?: string;
  Message?: string;
  /** The free-form API's own documented envelope: message_code 200 = ok,
   *  401 = client-key/secret-key incorrect or "No Cid" — regardless of the
   *  HTTP status. */
  message_code?: number | string;
  /** BMS-ecosystem envelope (hosxp.net PasteJSON, bmscloud): MessageCode 200
   *  = ok, anything else = failure — defensive, not documented here. */
  MessageCode?: number | string;
  /** Defensive: a template-era echo of a failed render. Not produced by the
   *  free-form endpoint, but a body that literally says this is never a
   *  delivered message. */
  line_message?: string | null;
  app_message?: string | null;
}

function parseResponse(raw: RawMessagesResponse): MophFreeFormAlertResponse {
  const bodyMessage = raw.message ?? raw.Message;
  // Body-level failure detection: the documented message_code ≠ 200 (401 bad
  // keys / No Cid arrives this way), explicit success:false, a status string
  // that reads like a failure, or a literal "Error template" line_message
  // (defensive carry-over from the template endpoint).
  const code = raw.message_code ?? raw.MessageCode;
  const messageCodeFail = code !== undefined && code !== null && String(code) !== '200';
  const lineMessageError =
    typeof raw.line_message === 'string' &&
    raw.line_message.trim().toLowerCase() === 'error template';
  const explicitFail =
    raw.success === false ||
    messageCodeFail ||
    lineMessageError ||
    (typeof raw.status === 'string' && /fail|error|invalid|not_found|not found/i.test(raw.status));
  const reason = explicitFail
    ? (bodyMessage ??
      (lineMessageError
        ? `template render failed: line_message "${raw.line_message}"`
        : null) ??
      (messageCodeFail ? `message_code ${code}` : null) ??
      (typeof raw.status === 'string' ? raw.status : null) ??
      'unknown')
    : null;
  return {
    messageId: raw.message_id ?? raw.data?.message_id ?? raw.id ?? null,
    success: !explicitFail,
    reason,
  };
}

function buildBody(input: SendMophFreeFormAlertInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    cid: [input.cid],
    messages: input.messages,
    message_type: mophAlertMessageType(),
  };
  // The app-inbox fields are optional per the PDF — send only what we have.
  if (input.messageTitle) body.message_title = input.messageTitle;
  if (input.messageHtml) body.message_html = input.messageHtml;
  if (input.messageText) body.message_text = input.messageText;
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send one alert through the MOPH Alert Free Form API v3.1. Resolves with the
 * parsed outcome on any 2xx (the documented message_code envelope may still
 * downgrade it — check `res.success`). Rejects with {@link MophPromptError}
 * for 4xx (terminal) or exhausted 5xx/timeout retries, exactly like
 * sendMophPrompt.
 */
export async function sendMophFreeFormAlert(
  input: SendMophFreeFormAlertInput,
): Promise<MophFreeFormAlertResponse> {
  if (!isValidCid(input.cid)) {
    throw new MophPromptError(
      'INVALID_CID',
      `cid must be exactly 13 digits (got length ${input.cid.length})`,
      400,
    );
  }
  if (!Array.isArray(input.messages) || input.messages.length === 0) {
    throw new MophPromptError('VALIDATION', 'messages must be a non-empty array', 400);
  }
  if (input.messages.length > 5) {
    // The PDF caps messages at 5 bubbles — reject early instead of shipping a
    // body the provider will bounce.
    throw new MophPromptError(
      'VALIDATION',
      `messages must not exceed 5 (got ${input.messages.length})`,
      400,
    );
  }
  const url = `${mophAlertApiUrl().replace(/\/+$/, '')}/alert/v3.1/messages`;
  const { clientKey, secretKey } = mophAlertKeys();
  const { max502Retries, retryBackoffMs, perSendTimeoutMs } = mophAlertLimits();
  const body = buildBody(input);

  let attempt = 0;
  // total attempts = 1 initial + max502Retries retries
  for (let remaining = max502Retries; ; remaining--) {
    attempt++;
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'client-key': clientKey,
          'secret-key': secretKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(perSendTimeoutMs),
      });
    } catch {
      // Timeout / network — retryable, same bucket as 5xx.
      const isLast = remaining <= 0;
      if (isLast) {
        logger.warn('moph_alert_v31_timeout_exhausted', { attempt });
        throw new MophPromptError(
          'RETRYABLE_EXHAUSTED',
          `send timed out after ${attempt} attempts`,
          0,
        );
      }
      logger.debug('moph_alert_v31_timeout_retry', { attempt });
      await sleep(retryBackoffMs * 2 ** (attempt - 1));
      continue;
    }

    if (resp.status >= 200 && resp.status < 300) {
      // The documented success body is {message, message_code}; keep the raw
      // body in the logs (truncated, no patient data) so a "2xx but nothing
      // delivered" report has evidence instead of a silent dead end.
      const rawText = await resp.text();
      logger.info('moph_alert_v31_response', {
        httpStatus: resp.status,
        body: rawText.slice(0, 300),
      });
      let raw: RawMessagesResponse = {};
      try {
        raw = JSON.parse(rawText) as RawMessagesResponse;
      } catch {
        // Non-JSON 2xx body — parseResponse sees an empty object (success).
      }
      return parseResponse(raw);
    }

    // 4xx — terminal, no retry.
    if (resp.status === 401 || resp.status === 403) {
      throw new MophPromptError(
        'AUTH',
        `${resp.status}: missing/invalid client-key/secret-key`,
        resp.status,
      );
    }
    if (resp.status === 422) {
      throw new MophPromptError('VALIDATION', `422 body validation error`, 422);
    }
    if (resp.status >= 400 && resp.status < 500) {
      throw new MophPromptError('CLIENT_ERROR', `${resp.status} client error`, resp.status);
    }

    // 5xx — retryable.
    const isLast = remaining <= 0;
    if (isLast) {
      logger.warn('moph_alert_v31_5xx_exhausted', { attempt, status: resp.status });
      throw new MophPromptError(
        'RETRYABLE_EXHAUSTED',
        `${resp.status} after ${attempt} attempts`,
        resp.status,
      );
    }
    logger.debug('moph_alert_v31_5xx_retry', { attempt, status: resp.status });
    await sleep(retryBackoffMs * 2 ** (attempt - 1));
  }
}
