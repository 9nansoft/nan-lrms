// Consult inbox — the HUB consults the province's OB-GYN team answers.
//
// A community hospital's care team sends a consult UP to this hospital (the
// provincial hub). This page is the hub clinicians' working list: each row
// names the patient and the asking hospital, links to the full record (a
// provincial hub sees the whole province), and expands in place to type the
// advice and mark it answered. Live updates ride the dashboard SSE stream
// (consult_requested / consult_updated carry the hub's hcode).
'use client';

import { useState } from 'react';
import { Stethoscope } from 'lucide-react';
import { ListPageLayout } from '@/components/shared/ListPageLayout';
import { LoadingState } from '@/components/shared/LoadingState';
import { SectionCard } from '@/components/shared/SectionCard';
import { ConsultInboxList } from '@/components/consult/ConsultInboxList';
import { useConsultInbox } from '@/hooks/useConsultInbox';
import { useSSE } from '@/hooks/useSSE';
import { useSetBreadcrumbs } from '@/components/layout/BreadcrumbContext';
import { debounceLeadingTrailing, SSE_REFRESH_DEBOUNCE_MS } from '@/lib/debounce';

type InboxFilter = 'all' | 'pending' | 'answered';

const FILTERS: Array<{ key: InboxFilter; label: string }> = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'pending', label: 'รอคำตอบ' },
  { key: 'answered', label: 'ตอบแล้ว' },
];

export default function ConsultInboxPage() {
  const [filter, setFilter] = useState<InboxFilter>('all');
  const { consults, pendingCount, isLoading, error, mutate, answerConsult, progressConsult } =
    useConsultInbox();
  useSetBreadcrumbs([{ label: 'แดชบอร์ด', href: '/' }, { label: 'คำปรึกษา' }]);

  // A consult_requested / consult_updated event carrying this hospital's
  // hcode (as toHcode) means the inbox changed — refresh immediately.
  const debouncedMutate = debounceLeadingTrailing(() => {
    void mutate();
  }, SSE_REFRESH_DEBOUNCE_MS);
  useSSE({ onPatientUpdate: () => debouncedMutate() });

  const filtered = consults.filter((consult) => {
    if (filter === 'pending') return consult.status !== 'COMPLETED';
    if (filter === 'answered') return consult.status === 'COMPLETED';
    return true;
  });

  return (
    <ListPageLayout
      title="คำปรึกษาจากโรงพยาบาลชุมชน"
      subtitle="คำปรึกษาที่โรงพยาบาลชุมชนส่งขึ้นมายังทีมสูติศาสตร์ของโรงพยาบาลแม่ข่าย — ตอบได้จากหน้านี้"
      updatedAt={null}
    >
      {isLoading && <LoadingState message="กำลังโหลดคำปรึกษา…" />}

      {!isLoading && (
        <SectionCard
          title="รายการคำปรึกษา"
          description={
            error
              ? 'ดึงข้อมูลไม่สำเร็จ — ข้อมูลจะลองใหม่อัตโนมัติ'
              : `รอคำตอบ ${pendingCount} รายการ · ทั้งหมด ${consults.length} รายการ`
          }
          testId="consult-inbox"
          actions={<Stethoscope aria-hidden="true" className="h-5 w-5 text-brand" />}
        >
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={
                  filter === f.key
                    ? 'rounded-full border border-brand bg-brand-soft px-3 py-1 text-caption font-semibold text-brand-strong'
                    : 'rounded-full border border-border bg-surface-card px-3 py-1 text-caption text-ink-muted hover:bg-surface-muted'
                }
              >
                {f.label}
              </button>
            ))}
          </div>

          {Boolean(error) && (
            <p role="alert" className="text-caption text-danger-text">
              ไม่สามารถแสดงคำปรึกษาได้ — ระบบจะลองใหม่อัตโนมัติ หรือรีเฟรชหน้าเพื่อดึงข้อมูลอีกครั้ง
            </p>
          )}

          {!error && <ConsultInboxList consults={filtered} onAnswer={answerConsult} onProgress={(consult) => progressConsult(consult, 'CONTACTED')} />}
        </SectionCard>
      )}
    </ListPageLayout>
  );
}
