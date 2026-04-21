import { SessionProvider } from 'next-auth/react';
import { TopNavBarSlot } from '@/components/layout/TopNavBarSlot';
import { ContentFrameSlot } from '@/components/layout/ContentFrameSlot';
import { BreadcrumbProvider } from '@/components/layout/BreadcrumbContext';
import { DbHealthBanner } from '@/components/layout/DbHealthBanner';

export default function ProvincialLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BreadcrumbProvider>
        <div className="flex min-h-screen flex-col bg-slate-50/50">
          <DbHealthBanner />
          <TopNavBarSlot />
          <main className="flex-1">
            <ContentFrameSlot>{children}</ContentFrameSlot>
          </main>
        </div>
      </BreadcrumbProvider>
    </SessionProvider>
  );
}
