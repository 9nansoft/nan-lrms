// The maternity assessment forms ([LR]) as THREE tabs — แรกรับ / ระยะคลอด /
// หลังคลอด — each tab drawing its form the way HOSxP does (see
// src/config/assessment-form-layouts.ts and the lr*-from.png reference
// images).
//
// Tab titles come from the config (MATERNITY_ASSESSMENT_FORMS), so there is
// ONE source of truth for them. Shared by the hospital console (live from
// HOSxP) and the provincial patient detail (from the cache) — both render
// the same DTO shape.
'use client';

import { useMemo, useState } from 'react';
import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';
import type { MaternityAssessmentDto, MaternityAssessmentKey } from '@/types/maternity-assessments';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { FirstPregnantFormView } from './assessments/FirstPregnantFormView';
import { TimeRowFormView } from './assessments/TimeRowFormView';
import { fmtDateTh, fmtDateTimeTh, renderAssessmentValue } from './assessments/assessment-field-ui';

// The old flat list exposed these; they stay exported so any consumer of
// the module keeps working.
export { fmtDateTh, fmtDateTimeTh, renderAssessmentValue };

export interface AssessmentFormsProps {
  assessments: MaternityAssessmentDto[];
  /** Shown when nothing was recorded. */
  emptyMessage?: string;
  className?: string;
}

/** One tab's records: the record picker, the record header and the form view. */
function FormTabPanel({
  formKey,
  records,
  emptyMessage,
}: {
  formKey: MaternityAssessmentKey;
  records: MaternityAssessmentDto[];
  emptyMessage: string;
}) {
  const [index, setIndex] = useState(0);

  if (records.length === 0) {
    return <p className="text-label text-ink-muted">{emptyMessage}</p>;
  }

  const record = records[Math.min(index, records.length - 1)];

  return (
    <div className="flex flex-col gap-3">
      {records.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="เลือกรายการบันทึก">
          {records.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                'rounded-full border px-2.5 py-1 text-caption tabular-nums',
                i === index
                  ? 'border-brand bg-brand-soft font-semibold text-brand-strong'
                  : 'border-border bg-surface-card text-ink-muted hover:bg-surface-muted',
              )}
            >
              {fmtDateTimeTh(item.recordedAt)}
            </button>
          ))}
        </div>
      )}

      <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface-muted/40 p-3">
        <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-ink-muted">
          {record.formName && <span className="font-medium text-ink">{record.formName}</span>}
          <span className="tabular-nums">บันทึก {fmtDateTimeTh(record.recordedAt)}</span>
          {record.recordedDate && (
            <span className="tabular-nums">วันที่ในแบบฟอร์ม {fmtDateTh(record.recordedDate)}</span>
          )}
          {record.entryStaff && <span>ผู้บันทึก {record.entryStaff}</span>}
        </header>

        {record.fields.length === 0 ? (
          <p className="text-caption text-ink-muted">ไม่มีรายการข้อมูลในแบบฟอร์มนี้</p>
        ) : formKey === 'first_pregnant' ? (
          <FirstPregnantFormView record={record} />
        ) : (
          <TimeRowFormView record={record} />
        )}
      </article>
    </div>
  );
}

export function AssessmentForms({
  assessments,
  emptyMessage = 'ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา',
  className,
}: AssessmentFormsProps) {
  // Newest record of each kind first — a nurse reads the latest one. The
  // tab order follows the config (แรกรับ → ระยะคลอด → หลังคลอด).
  const groups = useMemo(
    () =>
      MATERNITY_ASSESSMENT_FORMS.map((form) => ({
        form,
        records: assessments
          .filter((a) => a.formKey === form.key)
          .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime()),
      })),
    [assessments],
  );

  const initialKey =
    groups.find((group) => group.records.length > 0)?.form.key ?? MATERNITY_ASSESSMENT_FORMS[0].key;
  const [active, setActive] = useState<MaternityAssessmentKey>(initialKey);

  if (assessments.length === 0) {
    return <p className={cn('text-label text-ink-muted', className)}>{emptyMessage}</p>;
  }

  return (
    <Tabs
      value={active}
      onValueChange={(value) => setActive(value as MaternityAssessmentKey)}
      className={cn('flex flex-col gap-3', className)}
    >
      <TabsList variant="line" className="h-auto w-full flex-wrap justify-start gap-1">
        {groups.map(({ form, records }) => (
          <TabsTrigger key={form.key} value={form.key} className="h-8 flex-none gap-1.5 px-2 text-label">
            {form.titleTh}
            {records.length > 1 && (
              <span className="rounded-full bg-brand-soft px-1.5 text-caption font-semibold leading-4 text-brand-strong tabular-nums">
                {records.length}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

      {groups.map(({ form, records }) => (
        <TabsContent key={form.key} value={form.key} keepMounted className="min-w-0">
          <FormTabPanel formKey={form.key} records={records} emptyMessage={emptyMessage} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
