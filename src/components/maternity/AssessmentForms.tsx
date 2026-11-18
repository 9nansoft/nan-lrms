// The maternity assessment forms ([LR] แรกรับ / ระยะคลอด / หลังคลอด) as a
// list of labelled fields.
//
// Shared by the hospital console (live from HOSxP) and the provincial
// patient detail (from the cache) — both render the same DTO shape.
'use client';

import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';
import type {
  MaternityAssessmentDto,
  MaternityAssessmentField,
} from '@/types/maternity-assessments';
import { cn } from '@/lib/utils';

const FORM_TITLES: Record<string, string> = {
  first_pregnant: 'แรกรับ',
  birth_period: 'ระยะคลอด',
  after_birth: 'หลังคลอด',
};

export function fmtDateTimeTh(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('th-TH', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateTh(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

/** Checkboxes carry 'Y'/'N' — say it in words instead of showing the code. */
export function renderAssessmentValue(field: MaternityAssessmentField): React.ReactNode {
  if (field.component === 'CheckBox') {
    if (field.value === 'Y') return <span className="font-semibold text-ok-text">✓ ใช่</span>;
    if (field.value === 'N') return <span className="text-ink-muted">✗ ไม่ใช่</span>;
  }
  if (field.component === 'Memo') {
    return <span className="whitespace-pre-wrap break-words">{field.value}</span>;
  }
  return <span className="break-words">{field.value}</span>;
}

export interface AssessmentFormsProps {
  assessments: MaternityAssessmentDto[];
  /** Shown when nothing was recorded. */
  emptyMessage?: string;
  className?: string;
}

export function AssessmentForms({
  assessments,
  emptyMessage = 'ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา',
  className,
}: AssessmentFormsProps) {
  // Newest form of each kind first — a nurse reads the latest record.
  const grouped = MATERNITY_ASSESSMENT_FORMS.map((form) => ({
    form,
    records: assessments
      .filter((a) => a.formKey === form.key)
      .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
  })).filter((group) => group.records.length > 0);

  if (grouped.length === 0) {
    return <p className="text-label text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {grouped.map(({ form, records }) => (
        <div key={form.key} className="flex flex-col gap-2">
          <h3 className="text-label font-semibold text-brand">
            {FORM_TITLES[form.key] ?? form.titleTh}
            {records.length > 1 && (
              <span className="ml-2 text-caption font-normal text-ink-muted">
                {records.length} ครั้ง
              </span>
            )}
          </h3>

          {records.map((record) => (
            <article
              key={record.id}
              className="rounded-xl border border-border bg-surface-muted/40 p-3"
            >
              <header className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
                <span className="tabular-nums">บันทึก {fmtDateTimeTh(record.recordedAt)}</span>
                {record.recordedDate && (
                  <span className="tabular-nums">
                    วันที่ในแบบฟอร์ม {fmtDateTh(record.recordedDate)}
                  </span>
                )}
                {record.entryStaff && <span>ผู้บันทึก {record.entryStaff}</span>}
              </header>

              {record.fields.length === 0 ? (
                <p className="text-caption text-ink-muted">ไม่มีรายการข้อมูลในแบบฟอร์มนี้</p>
              ) : (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {record.fields.map((field) => (
                    <div key={`${record.id}-${field.column}`} className="min-w-0 text-label">
                      <dt className="text-caption text-ink-muted">{field.label}</dt>
                      <dd className="text-ink">{renderAssessmentValue(field)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </article>
          ))}
        </div>
      ))}
    </div>
  );
}
