// Assessments tab — the maternity assessment forms ([LR] แรกรับ /
// ระยะคลอด / หลังคลอด) of the patient whose drawer is open, read live from
// HOSxP through the browser's BMS session.
'use client';

import useSWR from 'swr';
import { useBmsSession } from '@/hooks/useBmsSession';
import { getPatientAssessments } from '@/services/maternity-ward';
import { AssessmentForms } from '@/components/maternity/AssessmentForms';

export function AssessmentsTab({ an }: { an: string }) {
  const { config } = useBmsSession();
  const { data, error, isLoading, mutate } = useSWR(
    config ? ['assessments', config.apiUrl, an] : null,
    () => getPatientAssessments(config!, an),
  );

  if (!config) {
    return <div className="p-4 text-slate-500">ไม่พร้อมใช้งาน (ไม่มี BMS session)</div>;
  }
  if (isLoading) return <div className="p-4 text-slate-500">กำลังโหลด…</div>;
  if (error) {
    return (
      <div className="p-4">
        <p className="text-danger-text">โหลดไม่สำเร็จ: {(error as Error).message}</p>
        <button
          type="button"
          onClick={() => void mutate()}
          className="mt-2 text-label text-brand underline"
        >
          ลองอีกครั้ง
        </button>
      </div>
    );
  }

  return (
    <div className="p-4">
      <p className="mb-3 text-caption text-ink-muted">
        แบบฟอร์มประเมินจาก HOSxP · {data?.length ?? 0} รายการ
      </p>
      <AssessmentForms assessments={data ?? []} emptyMessage="ยังไม่มีแบบฟอร์มประเมินที่บันทึกไว้ใน HOSxP" />
    </div>
  );
}
