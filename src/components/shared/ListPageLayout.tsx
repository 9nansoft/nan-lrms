// src/components/shared/ListPageLayout.tsx
// The list-page frame (UI sub-project 4): an @container root (page layouts
// switch on CONTENT width, not viewport — the sidebar takes 232px), the
// cached-data banner, and the PageHeader with the page-data freshness label.
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { PAGE_DATA_FRESHNESS_LABEL } from '@/config/list-page';

export interface ListPageStale {
  message: string;
  onRetry: () => void;
  /** When known, the remedy names the auto-retry cadence. */
  refreshSeconds?: number;
  lastUpdatedAt?: string | null;
}

export function ListPageLayout({
  title,
  subtitle,
  actions,
  updatedAt,
  freshnessLabel = PAGE_DATA_FRESHNESS_LABEL,
  stale,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** When this page's data was fetched; omitted until the first success. */
  updatedAt?: string | null;
  /** Override when `updatedAt` is a HOSxP sync time (e.g. one hospital's
   *  console: "ซิงค์ล่าสุด"), not the page fetch time. */
  freshnessLabel?: string;
  stale?: ListPageStale | null;
  children: ReactNode;
}) {
  return (
    <div className="@container min-h-full bg-surface-page">
      {stale && (
        <ErrorState
          variant="banner"
          message={stale.message}
          lastUpdatedAt={stale.lastUpdatedAt ?? updatedAt ?? null}
          remedy={
            stale.refreshSeconds
              ? `ระบบจะลองใหม่อัตโนมัติทุก ${stale.refreshSeconds} วินาที หรือกด ลองใหม่`
              : 'ระบบจะลองใหม่อัตโนมัติ หรือกด ลองใหม่'
          }
          onRetry={stale.onRetry}
        />
      )}
      <div className="flex flex-col gap-5 px-4 py-5 md:px-6">
        <PageHeader
          title={title}
          subtitle={subtitle}
          actions={actions}
          freshness={updatedAt ? { lastSyncAt: updatedAt, label: freshnessLabel } : undefined}
        />
        {children}
      </div>
    </div>
  );
}
