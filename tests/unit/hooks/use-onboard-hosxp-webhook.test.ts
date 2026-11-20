// The HOSxP webhook_setting row the app provisions.
//
// HOSxP's `webhook_setting` has `webhook_setting_url` (NOT `webhook_url`),
// and `webhook_setting_description` + `webhook_active` are NOT NULL. The
// old payload used the wrong column name and omitted the NOT NULL columns,
// so every INSERT was rejected by the database and every UPDATE failed with
// an unknown-column error — the row HOSxP is supposed to post to never
// existed.
//
// This test pins the payload shape against HOSxP's real schema.
import { describe, it, expect } from 'vitest';
import { webhookSettingPayload } from '@/hooks/useOnboardHosxpWebhook';

describe('webhook_setting provisioning payload', () => {
  it('writes the columns HOSxP actually has, with the NOT NULL ones filled', () => {
    const payload = webhookSettingPayload({
      apiKey: 'kklrms_test',
      url: 'https://kk-lrms.bmscloud.in.th/api/webhooks/patient-data',
    });

    // The real HOSxP column names.
    expect(payload).toHaveProperty('webhook_setting_url');
    expect(payload).not.toHaveProperty('webhook_url');
    expect(payload.webhook_setting_description).toBeTruthy();
    expect(payload.webhook_active).toBe('Y');
    expect(payload.webhook_authorization_key).toBe('kklrms_test');
    expect(payload.webhook_module_id).toBe(3);
    expect(payload.webhook_setting_code).toBe('NN-LRMS');
  });
});
