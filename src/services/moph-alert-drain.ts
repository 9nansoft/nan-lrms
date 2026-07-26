// Bounded MOPH alert drain — the ONLY site that performs LINE I/O (codex #1,
// hybrid variant). Invoked as a final step on the live browser-push path.
//
// Pops pending moph_alert_log rows for a hospital, re-derives a fresh BMS
// session (the in-band one may have expired between enqueue and drain — codex
// #6a), sends each via sendMophPrompt within a hard budget, and updates the row:
//   - success → status='sent', message_id, api_status, sent_at
//   - 502/timeout (RETRYABLE_EXHAUSTED) → status stays 'pending', attempts++,
//     last_error set (retried on the next drain)
//   - 4xx (CLIENT_ERROR/AUTH/VALIDATION/INVALID_CID) → status='failed' (terminal)
//
// NEVER throws to the caller — the sync run must not abort because LINE is
// slow/down. Returns a summary {sent, retryable, failed, skipped}.

import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { sendMophPrompt } from '@/services/moph-prompt';
import { resolveSessionIdForHospital } from '@/lib/bms-session';
import { mophAlertsEnabled, mophAlertLimits } from '@/config/moph-alert-config';
import {
  buildAlertFlex,
  alertTitle,
  type AlertSeverity,
  type AlertRecipientScope,
} from '@/config/moph-alert-templates';

export interface DrainOptions {
  maxAlerts?: number;
  perSendTimeoutMs?: number;
  budgetMs?: number;
}

export interface DrainSummary {
  sent: number;
  retryable: number;
  failed: number;
  skipped: number;
}

interface PendingRow {
  id: string;
  case_id: string;
  hospital_id: string;
  origin_hcode: string;
  recipient_cid: string;
  recipient_scope: string;
  alert_source: string;
  severity: string;
  rule_id: string;
  title: string;
  confirm_url: string | null;
  attempts: number;
}

const RETRYABLE_CODES = new Set(['RETRYABLE', 'RETRYABLE_EXHAUSTED']);
const TERMINAL_CODES = new Set(['CLIENT_ERROR', 'AUTH', 'VALIDATION', 'INVALID_CID']);

export async function drainMophAlerts(
  db: DatabaseAdapter,
  hospitalId: string,
  opts: DrainOptions = {},
): Promise<DrainSummary> {
  const summary: DrainSummary = { sent: 0, retryable: 0, failed: 0, skipped: 0 };
  if (!mophAlertsEnabled()) {
    logger.debug('moph_alert_drain_skipped_disabled', { hospitalId });
    return summary;
  }
  const limits = mophAlertLimits();
  const maxAlerts = opts.maxAlerts ?? limits.maxAlertsPerDrain;
  const budgetMs = opts.budgetMs ?? limits.drainBudgetMs;

  const rows = await db.query<PendingRow>(
    `SELECT id, case_id, hospital_id, origin_hcode, recipient_cid, recipient_scope,
            alert_source, severity, rule_id, title, confirm_url, attempts
     FROM moph_alert_log
     WHERE hospital_id = $1 AND status = 'pending'
     ORDER BY created_at
     LIMIT $2`,
    [hospitalId, maxAlerts],
  );
  if (rows.length === 0) return summary;

  // Re-derive a session once per drain (covers codex #6a session expiry). If it
  // fails, every row stays pending — no LINE I/O attempted.
  let sessionId: string;
  try {
    sessionId = await resolveSessionIdForHospital(db, hospitalId);
  } catch (err) {
    logger.warn('moph_alert_drain_no_session', { hospitalId, error: String(err) });
    summary.retryable = rows.length; // all deferred to next drain
    return summary;
  }

  const deadline = Date.now() + budgetMs;
  for (const row of rows) {
    if (Date.now() >= deadline) break; // budget exhausted — rest stay pending
    try {
      const severity = row.severity as AlertSeverity;
      const scope = row.recipient_scope as AlertRecipientScope;
      const flex = buildAlertFlex({
        severity,
        recipientScope: scope,
        // Drain has no hospital name on the row; origin_hcode is the fallback
        // label. (Enqueue stored title with the full name; the API resolves the
        // real hospital name server-side for audit regardless.)
        hospitalName: row.origin_hcode,
        caseRef: row.case_id,
        patientName: null, // never re-send patient data from the drain
        confirmUrl: row.confirm_url ?? null,
      });
      const res = await sendMophPrompt({
        sessionId,
        cid: row.recipient_cid,
        title: row.title,
        text: alertTitle({ severity, hospitalName: row.origin_hcode }),
        flex,
        confirmUrl: row.confirm_url ?? null,
      });
      const apiStatus = res.line.status; // success|failed|skipped
      const finalStatus =
        apiStatus === 'success' ? 'sent' : apiStatus === 'skipped' ? 'skipped' : 'failed';
      await db.query(
        `UPDATE moph_alert_log
         SET status = $1, message_id = $2, api_status = $3, attempts = attempts + 1,
             sent_at = $4, last_error = NULL, updated_at = NOW()
         WHERE id = $5`,
        [
          finalStatus,
          res.messageId,
          apiStatus,
          finalStatus === 'sent' ? new Date().toISOString() : null,
          row.id,
        ],
      );
      if (finalStatus === 'sent') summary.sent++;
      else if (finalStatus === 'skipped') summary.skipped++;
      else summary.failed++;
    } catch (err) {
      // Duck-type on `.code` rather than `instanceof MophPromptError`: under
      // vi.mock the imported class identity differs from thrown instances, and
      // upstream may reject with a decorated Error regardless. Property-check
      // is resilient to both.
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code: unknown }).code)
          : 'UNKNOWN';
      const isRetryable = RETRYABLE_CODES.has(code);
      const status = isRetryable ? 'pending' : TERMINAL_CODES.has(code) ? 'failed' : 'pending';
      await db.query(
        `UPDATE moph_alert_log
         SET status = $1, attempts = attempts + 1, last_error = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, String((err as Error)?.message ?? err), row.id],
      );
      if (isRetryable || code === 'UNKNOWN') summary.retryable++;
      else summary.failed++;
      logger.warn('moph_alert_send_failed', { id: row.id, code, status });
    }
  }
  logger.info('moph_alert_drain_done', { hospitalId, ...summary });
  return summary;
}
