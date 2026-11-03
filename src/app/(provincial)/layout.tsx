import { SessionProvider } from 'next-auth/react';
import { BmsSessionProvider } from '@/contexts/BmsSessionContext';
import { CallProvider } from '@/components/calls/CallProvider';
import { AppShell } from '@/components/layout/AppShell';
import { ContentFrameSlot } from '@/components/layout/ContentFrameSlot';
import { BreadcrumbProvider } from '@/components/layout/BreadcrumbContext';
import { DbHealthBanner } from '@/components/layout/DbHealthBanner';
import { ClinicalChatGate, chatReserveClass } from '@/components/chat/ClinicalChatGate';

// BmsSessionProvider is mounted here (in addition to the (hospital) layout)
// so the provincial dashboard can participate in the BMS session flow —
// specifically for `useOnboardHosxpWebhook` on `/`, which auto-provisions
// HOSxP's webhook_setting row when a marketplace_token is in the URL. The
// provider no-ops when no bms-session-id is present, so it's safe for users
// who arrive at `/` without marketplace context.
// Per-request render: the chat flag (CLINICAL_CHAT_ENABLED) must never be frozen
// at build time.
export const dynamic = 'force-dynamic';

export default function ProvincialLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BmsSessionProvider>
        <CallProvider>
          <BreadcrumbProvider>
            <DbHealthBanner />
            <AppShell variant="provincial">
              <main className={`flex-1 ${chatReserveClass()}`.trim()}>
                <ContentFrameSlot>{children}</ContentFrameSlot>
              </main>
            </AppShell>
            {/* Clinical chatbot — statistics mode (provincial dashboard
                aggregates). Clinical drilldown pages can override per-page. */}
            <ClinicalChatGate mode="statistics" />
          </BreadcrumbProvider>
        </CallProvider>
      </BmsSessionProvider>
    </SessionProvider>
  );
}
