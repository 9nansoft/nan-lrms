// The ระยะคลอด / หลังคลอด forms ([LR]-แบบฟอร์มการบันทึกการพยาบาล…) drawn as
// their จม./เวลา grid — docs/assessments/lr3-from.png and lr2-from.png: one
// row per ครั้งที่, each with the time, the observed condition, the nursing
// activity and the recorder. On narrow screens the grid folds into one
// bordered block per row with the column names as captions.
//
// Labels come from the site's own `assessment_items`; columns the standard
// grid does not name still show under อื่น ๆ.
'use client';

import { cn } from '@/lib/utils';
import type { MaternityAssessmentDto, MaternityAssessmentField } from '@/types/maternity-assessments';
import { FieldLine, FormFieldLine, UnmappedFields } from './assessment-field-ui';
import { groupAssessmentRecord, type GroupedTimeRow } from './group-assessment-fields';

// Tailwind arbitrary values use `_` for the spaces between track sizes.
const GRID_COLS =
  'md:grid-cols-[auto_minmax(0,1.05fr)_minmax(0,1.3fr)_auto]';

function Cell({
  title,
  fields,
  className,
}: {
  title: string;
  fields: readonly MaternityAssessmentField[];
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 border-t border-border px-2 py-2 md:border-l md:border-t-0', className)}>
      <p className="text-caption text-ink-muted md:hidden">{title}</p>
      {fields.length === 0 ? (
        <p className="text-caption text-ink-muted">—</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {fields.map((field) => (
            <FormFieldLine key={field.column} field={field} />
          ))}
        </div>
      )}
    </div>
  );
}

function TimeRow({ row, subjectTitle, activityTitle }: { row: GroupedTimeRow; subjectTitle: string; activityTitle: string }) {
  return (
    <div className={cn('grid grid-cols-1 border-t border-border', GRID_COLS)}>
      <div className="min-w-0 border-border px-2 py-2 md:border-r">
        <p className="text-caption text-ink-muted">ครั้งที่ {row.index}</p>
        <p className="text-label font-semibold tabular-nums text-ink">
          {row.timeField?.value ?? '—'}
          <span className="text-caption font-normal text-ink-muted"> น.</span>
        </p>
      </div>
      <Cell title={subjectTitle} fields={row.subjectFields} />
      <Cell title={activityTitle} fields={row.activityFields} />
      <div className="min-w-0 px-2 py-2">
        <p className="text-caption text-ink-muted md:hidden">ผู้บันทึก</p>
        <p className="text-label text-ink">{row.staffField?.value ?? '—'}</p>
      </div>
    </div>
  );
}

export function TimeRowFormView({ record }: { record: MaternityAssessmentDto }) {
  const grouped = groupAssessmentRecord(record);
  if (grouped.kind !== 'time-rows') return null;

  const visibleRows = grouped.rows.filter((row) => row.hasContent);

  return (
    <div className="flex flex-col gap-3">
      {grouped.dateField && <FieldLine field={grouped.dateField} />}

      <div className="overflow-hidden rounded-xl border border-border">
        <div className={cn('hidden bg-surface-muted md:grid', GRID_COLS)}>
          <div className="border-border px-2 py-1.5 text-caption font-semibold text-ink-muted">จม./เวลา</div>
          <div className="border-border border-l px-2 py-1.5 text-caption font-semibold text-ink-muted">
            {grouped.subjectTitle}
          </div>
          <div className="border-border border-l px-2 py-1.5 text-caption font-semibold text-ink-muted">
            {grouped.activityTitle}
          </div>
          <div className="border-border border-l px-2 py-1.5 text-caption font-semibold text-ink-muted">ผู้บันทึก</div>
        </div>
        {visibleRows.length === 0 ? (
          <p className="px-3 py-3 text-caption text-ink-muted">ไม่มีรายการลงเวลาที่บันทึกไว้</p>
        ) : (
          visibleRows.map((row) => (
            <TimeRow key={row.index} row={row} subjectTitle={grouped.subjectTitle} activityTitle={grouped.activityTitle} />
          ))
        )}
      </div>

      {grouped.footerFields.length > 0 && (
        <footer className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
          {grouped.footerFields.map((field) => (
            <FieldLine key={field.column} field={field} />
          ))}
        </footer>
      )}

      <UnmappedFields fields={grouped.unmapped} />
    </div>
  );
}
