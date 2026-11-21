// MOPH Alert Template API v3.1 sender client (LINE notify via morpromt2c).
//
// Thin typed wrapper around the external template endpoint (wire contract from
// docs/API MOPH Alert Template V3.1.postman_collection.json):
//   POST <origin>/alert/v3.1/template
//   headers: client-key + secret-key  (static credentials — NO Bearer session)
//   body: { cid, name, template, header, message_title, message_html,
//           message_text, message_type, url?, message_confirm_url?, message_datetime? }
// The registered `template` name and the key pair are issued by MOPH per app and
// are therefore env-configured (moph-alert-config.ts) — never hardcoded.
//
// Retry policy mirrors sendMophPrompt (moph-prompt.ts): 5xx/timeouts retry with
// exponential backoff up to MOPH_MAX_502_RETRIES; 4xx is terminal. The error
// type and codes are REUSED from moph-prompt so the drain's send/finalize path
// is transport-agnostic (it duck-types on `.code`).
//
// The v3.1 API's success response shape is not documented (the collection saves
// no responses), so 2xx is parsed defensively: any 2xx counts as success unless
// the body explicitly says failure, and the message id is extracted from the
// common `message_id` / `data.message_id` / `id` fields.
//
// This module performs NO audit write — the authoritative per-recipient record
// lives in moph_alert_log (same rule as moph-prompt.ts: no dual-audit).

import { logger } from '@/lib/logger';
import {
  mophAlertApiUrl,
  mophAlertKeys,
  mophAlertTemplate,
  mophAlertMessageType,
  mophAlertLimits,
} from '@/config/moph-alert-config';
import { isValidCid, MophPromptError } from '@/services/moph-prompt';

export interface SendMophTemplateAlertInput {
  /** Recipient Thai Citizen ID — exactly 13 digits, validated before send. */
  cid: string;
  /** Recipient display name (the API samples always carry one; '' allowed). */
  name: string;
  /** LINE message title (stored alert `title`). */
  messageTitle: string;
  /** Message body HTML (collection samples: simple <div><strong>…</strong></div>). */
  messageHtml: string;
  /** Message body plain text. */
  messageText: string;
  /** Optional action URL — sent as both `url` and `message_confirm_url`. */
  confirmUrl?: string | null;
  /** Optional ISO timestamp for the template's message_datetime field. */
  messageDatetime?: string | null;
}

export interface MophTemplateAlertResponse {
  /** Provider message id, when the response carries one. */
  messageId: string | null;
  /** True when the API accepted the send (2xx, no explicit failure flag). */
  success: boolean;
}

interface RawTemplateResponse {
  message_id?: string | null;
  id?: string | null;
  data?: { message_id?: string | null } | null;
  success?: boolean;
  status?: string;
  message?: string;
}

function parseResponse(raw: RawTemplateResponse): MophTemplateAlertResponse {
  // Body-level failure flag (defensive — no documented failure shape).
  const explicitFail =
    raw.success === false || (typeof raw.status === 'string' && /fail|error/i.test(raw.status));
  return {
    messageId: raw.message_id ?? raw.data?.message_id ?? raw.id ?? null,
    success: !explicitFail,
  };
}

function buildBody(input: SendMophTemplateAlertInput): Record<string, unknown> {
  const template = mophAlertTemplate();
  const body: Record<string, unknown> = {
    cid: input.cid,
    name: input.name ?? '',
    template: template.template,
    header: template.header,
    message_title: input.messageTitle,
    message_html: input.messageHtml,
    message_text: input.messageText,
    message_type: mophAlertMessageType(),
  };
  if (input.confirmUrl) {
    body.url = input.confirmUrl;
    body.message_confirm_url = input.confirmUrl;
  }
  if (input.messageDatetime) body.message_datetime = input.messageDatetime;
  return body;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send one alert through the MOPH Alert Template API v3.1. Resolves with the
 * parsed outcome on any 2xx (body `success` may still downgrade it — check
 * `res.success`). Rejects with {@link MophPromptError} for 4xx (terminal) or
 * exhausted 5xx/timeout retries, exactly like sendMophPrompt.
 */
export async function sendMophTemplateAlert(
  input: SendMophTemplateAlertInput,
): Promise<MophTemplateAlertResponse> {
  if (!isValidCid(input.cid)) {
    throw new MophPromptError(
      'INVALID_CID',
      `cid must be exactly 13 digits (got length ${input.cid.length})`,
      400,
    );
  }
  const url = `${mophAlertApiUrl().replace(/\/+$/, '')}/alert/v3.1/template`;
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
      const raw = (await resp.json().catch(() => ({}))) as RawTemplateResponse;
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
      throw new MophPromptError('VALIDATION', `422 body/template validation error`, 422);
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
