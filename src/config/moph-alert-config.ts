// MOPH Prompt (LINE) risk-alert configuration.
//
// Single source of truth for the alert pipeline's tunables and the external
// MOPH Prompt API endpoint. Centralized here so the sender, drain, and trigger
// sites never hardcode thresholds or URLs (constitution: no hardcoded
// conditions for data lookup / external calls).

/** MOPH Prompt "send via BMS session" endpoint. */
export function mophPromptApiUrl(): string {
  return (
    process.env.MOPH_PROMPT_API_URL?.trim() ||
    'https://sms.bmscloud.in.th/v1/moph/send-via-bms-session'
  );
}

// ---------------------------------------------------------------------------
// MOPH Alert Template API v3.1 transport (docs/API MOPH Alert Template
// V3.1.postman_collection.json): POST <url>/alert/v3.1/template with static
// client-key/secret-key headers — no per-hospital BMS session. Selected via
// MOPH_TRANSPORT; the default 'bms' keeps every existing deployment unchanged.
// ---------------------------------------------------------------------------

export type MophAlertTransport = 'bms' | 'v3.1';

/** Which sender the drain uses. Anything but 'v3.1' falls back to 'bms'. */
export function mophAlertTransport(): MophAlertTransport {
  return process.env.MOPH_TRANSPORT?.trim().toLowerCase() === 'v3.1' ? 'v3.1' : 'bms';
}

/** MOPH Alert Template API origin (the collection's {{prod}} variable). */
export function mophAlertApiUrl(): string {
  return process.env.MOPH_ALERT_API_URL?.trim() || 'https://morpromt2c.moph.go.th';
}

export interface MophAlertKeys {
  clientKey: string;
  secretKey: string;
}

/** Static API credentials sent as client-key/secret-key headers. No defaults —
 *  issued per hospital app by MOPH (see the collection's header pairs). */
export function mophAlertKeys(): MophAlertKeys {
  return {
    clientKey: process.env.MOPH_ALERT_CLIENT_KEY?.trim() ?? '',
    secretKey: process.env.MOPH_ALERT_SECRET_KEY?.trim() ?? '',
  };
}

export interface MophAlertTemplateConfig {
  /** Registered template name — REQUIRED, MOPH approves one per app. */
  template: string;
  /** Message header; falls back to the template name (samples set both alike). */
  header: string;
}

export function mophAlertTemplate(): MophAlertTemplateConfig {
  const template = process.env.MOPH_ALERT_TEMPLATE?.trim() ?? '';
  return { template, header: process.env.MOPH_ALERT_HEADER?.trim() || template };
}

/** Message type tag from the collection samples ('HPT' in every request). */
export function mophAlertMessageType(): string {
  return process.env.MOPH_ALERT_MESSAGE_TYPE?.trim() || 'HPT';
}

/** True when the v3.1 transport has everything it needs to send. Missing keys
 *  or the MOPH-approved template name is a configuration error, not a transient
 *  failure — the drain dead-letters rows with a clear last_error instead of
 *  retrying forever. */
export function mophTemplateConfigured(): boolean {
  const { clientKey, secretKey } = mophAlertKeys();
  return Boolean(clientKey && secretKey && mophAlertTemplate().template);
}

/** Master switch. When false, producers enqueue nothing and the drain is a no-op. */
export function mophAlertsEnabled(): boolean {
  return process.env.MOPH_ALERTS_ENABLED !== 'false';
}

/** The Bangkok calendar day (YYYY-MM-DD) that alert dedup + expiry key on.
 *  An alert is only "current" on the day it was raised; prior-day rows expire. */
export function mophAlertLocalDate(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

export interface MophAlertLimits {
  /** Max pending rows processed per drain invocation. */
  maxAlertsPerDrain: number;
  /** Per-send HTTP timeout (ms). */
  perSendTimeoutMs: number;
  /** Total drain budget (ms) — stop sending when exceeded, leave rest pending. */
  drainBudgetMs: number;
  /** Max 502 retries per row before giving up (row stays pending across drains
   *  until this per-attempt ceiling; after it, mark failed). */
  max502Retries: number;
  /** Base backoff (ms) for 502 retries — doubled per attempt. */
  retryBackoffMs: number;
  /** Retention window (days) for terminal (sent/failed) moph_alert_log rows.
   *  0 = keep forever. The drain purges rows older than this after each run. */
  retentionDays: number;
}

export function mophAlertLimits(): MophAlertLimits {
  return {
    maxAlertsPerDrain: numEnv('MOPH_MAX_ALERTS_PER_DRAIN', 5),
    perSendTimeoutMs: numEnv('MOPH_PER_SEND_TIMEOUT_MS', 3000),
    drainBudgetMs: numEnv('MOPH_DRAIN_BUDGET_MS', 10000),
    max502Retries: numEnv('MOPH_MAX_502_RETRIES', 4),
    retryBackoffMs: numEnv('MOPH_RETRY_BACKOFF_MS', 500),
    retentionDays: numEnv('MOPH_ALERT_RETENTION_DAYS', 90),
  };
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
