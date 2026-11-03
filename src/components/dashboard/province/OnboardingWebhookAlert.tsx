// Shown when auto-provisioning HOSxP's webhook_setting failed on first
// onboarding: what failed, the server's error, and what to do.
'use client';

import { DismissibleAlert } from '@/components/shared/DismissibleAlert';

export function OnboardingWebhookAlert({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <DismissibleAlert
      title="ไม่สามารถอัปเดต webhook_setting บน HOSxP"
      detail={error}
      remedy="เปิด NN-LRMS จากเมนูใน HOSxP อีกครั้ง หากยังไม่หาย แจ้งผู้ดูแลระบบพร้อมข้อความด้านบน"
      onDismiss={onDismiss}
    />
  );
}
