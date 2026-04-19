import { SessionProvider } from 'next-auth/react';
import { TopNavBar } from '@/components/layout/TopNavBar';
import { BreadcrumbProvider } from '@/components/layout/BreadcrumbContext';

export default function ProvincialLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <BreadcrumbProvider>
        <div className="flex min-h-screen flex-col bg-slate-50/50">
          <TopNavBar />
          <main className="flex-1">
            <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
          </main>
        </div>
      </BreadcrumbProvider>
    </SessionProvider>
  );
}
