// Hook that auto-provisions the HOSxP webhook_setting row for KK-LRMS
// when a user lands on `/` with a valid BMS session + marketplace_token.
//
// Flow:
//   1. Query HOSxP via BMS /api/sql:
//        SELECT COUNT(*) AS n FROM webhook_setting
//        WHERE webhook_module_id = 3 AND webhook_setting_code = 'KK-LRMS'
//   2. If a row already exists → done, remember for this tab.
//   3. If not:
//        a. POST /api/onboarding/webhook-key  (mints a KK-LRMS API key
//           bound to the session's hospital, returns the raw key once).
//        b. POST /api/rest/webhook_setting via BMS with:
//             webhook_module_id        = 3
//             webhook_setting_code     = 'KK-LRMS'
//             webhook_authorization_key = <the raw key>
//             webhook_url              = <KK-LRMS public webhook URL>
//
// Ref-guarded so it runs at most once per tab/session even under
// React-strict-mode double mount. SessionStorage persists two separate
// markers per hospital code:
//   DONE    — final success; skip provisioning on future mounts
//   PENDING — mint succeeded but the HOSxP insert failed. On retry we
//             reuse the cached key instead of minting another one, to
//             prevent orphaned keys accumulating on transient BMS errors.
'use client';

import { useEffect, useRef } from 'react';
import { useBmsSession } from '@/contexts/BmsSessionContext';
import { executeSql, restInsert } from '@/lib/bms-browser-client';

const DONE_STORAGE_KEY = 'kk-lrms:hosxp-webhook-onboarded';
const PENDING_STORAGE_KEY = 'kk-lrms:hosxp-webhook-pending-key';
const WEBHOOK_MODULE_ID = 3;
const WEBHOOK_SETTING_CODE = 'KK-LRMS';

function resolveKkLrmsWebhookUrl(): string {
  if (typeof window === 'undefined') return '';
  // Reuse the deployed origin — HOSxP will POST back here with the auth key.
  // Override via NEXT_PUBLIC_KK_LRMS_PUBLIC_URL when the public origin
  // differs from window.location (e.g. behind a reverse proxy).
  const override = process.env.NEXT_PUBLIC_KK_LRMS_PUBLIC_URL;
  const origin = override && override.length > 0 ? override : window.location.origin;
  return `${origin.replace(/\/$/, '')}/api/webhooks/patient-data`;
}

interface PendingKey {
  apiKey: string;
  keyPrefix: string;
}

function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && !!window.sessionStorage;
}

function readDone(hcode: string): boolean {
  if (!hasSessionStorage() || !hcode) return false;
  return window.sessionStorage.getItem(`${DONE_STORAGE_KEY}:${hcode}`) === '1';
}

function writeDone(hcode: string): void {
  if (!hasSessionStorage() || !hcode) return;
  window.sessionStorage.setItem(`${DONE_STORAGE_KEY}:${hcode}`, '1');
}

function readPending(hcode: string): PendingKey | null {
  if (!hasSessionStorage() || !hcode) return null;
  try {
    const raw = window.sessionStorage.getItem(`${PENDING_STORAGE_KEY}:${hcode}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingKey>;
    if (typeof parsed.apiKey === 'string' && typeof parsed.keyPrefix === 'string') {
      return { apiKey: parsed.apiKey, keyPrefix: parsed.keyPrefix };
    }
  } catch {
    // ignore corrupt entry — treat as no pending
  }
  return null;
}

function writePending(hcode: string, key: PendingKey): void {
  if (!hasSessionStorage() || !hcode) return;
  window.sessionStorage.setItem(
    `${PENDING_STORAGE_KEY}:${hcode}`,
    JSON.stringify(key),
  );
}

function clearPending(hcode: string): void {
  if (!hasSessionStorage() || !hcode) return;
  window.sessionStorage.removeItem(`${PENDING_STORAGE_KEY}:${hcode}`);
}

export interface OnboardHosxpWebhookResult {
  ran: boolean;
  alreadyExisted?: boolean;
  createdKeyPrefix?: string;
  error?: string;
}

export function useOnboardHosxpWebhook(): {
  state: OnboardHosxpWebhookResult | null;
} {
  const { config, userInfo, marketplaceToken, isReady } = useBmsSession();
  const ranRef = useRef(false);
  const stateRef = useRef<OnboardHosxpWebhookResult | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    if (!isReady || !config || !userInfo || !marketplaceToken) return;
    const hcode = userInfo.hospcode;
    if (!hcode) {
      // No hcode means we have nothing to key provisioning against. Bail
      // silently — the admin can still provision manually via /admin.
      ranRef.current = true;
      return;
    }

    // Fast path: already provisioned in this tab/session.
    if (readDone(hcode)) {
      ranRef.current = true;
      stateRef.current = { ran: false, alreadyExisted: true };
      return;
    }

    ranRef.current = true;
    void (async () => {
      try {
        // Step 1 — check HOSxP webhook_setting
        const check = await executeSql<{ n: number }>(
          `SELECT COUNT(*) AS n FROM webhook_setting
           WHERE webhook_module_id = :moduleId
             AND webhook_setting_code = :settingCode`,
          config,
          { moduleId: WEBHOOK_MODULE_ID, settingCode: WEBHOOK_SETTING_CODE },
          marketplaceToken,
        );
        const existingCount = Number(check?.data?.[0]?.n ?? 0);
        if (existingCount > 0) {
          stateRef.current = { ran: true, alreadyExisted: true };
          clearPending(hcode); // discard any stale pending key
          writeDone(hcode);
          return;
        }

        // Step 2 — mint a KK-LRMS webhook key (or reuse a pending one from
        // an earlier partial failure so we don't orphan extra keys).
        let minted: PendingKey | null = readPending(hcode);
        if (!minted) {
          const res = await fetch('/api/onboarding/webhook-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: 'HOSxP webhook_setting auto-provision' }),
          });
          if (!res.ok) {
            const err = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(err?.error ?? `failed to mint key (HTTP ${res.status})`);
          }
          const payload = (await res.json()) as { apiKey?: unknown; keyPrefix?: unknown };
          if (typeof payload.apiKey !== 'string' || typeof payload.keyPrefix !== 'string') {
            throw new Error('webhook-key response missing apiKey/keyPrefix');
          }
          minted = { apiKey: payload.apiKey, keyPrefix: payload.keyPrefix };
          // Persist immediately so a crash between here and restInsert
          // lets the next attempt reuse this exact key.
          writePending(hcode, minted);
        }

        // Step 3 — insert row into HOSxP webhook_setting
        await restInsert(
          'webhook_setting',
          {
            webhook_module_id: WEBHOOK_MODULE_ID,
            webhook_setting_code: WEBHOOK_SETTING_CODE,
            webhook_authorization_key: minted.apiKey,
            webhook_url: resolveKkLrmsWebhookUrl(),
          },
          config,
          marketplaceToken,
        );

        stateRef.current = {
          ran: true,
          alreadyExisted: false,
          createdKeyPrefix: minted.keyPrefix,
        };
        clearPending(hcode);
        writeDone(hcode);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // Surface the failure in the console — the hook has no UI so silent
        // errors are invisible. Retry allowed on next mount (ranRef reset),
        // but any minted key is cached in sessionStorage so we don't spin
        // up duplicates on repeated failures.
        console.warn('[onboarding] HOSxP webhook_setting provision failed:', message);
        ranRef.current = false;
        stateRef.current = { ran: true, error: message };
      }
    })();
  }, [config, userInfo, marketplaceToken, isReady]);

  return { state: stateRef.current };
}
