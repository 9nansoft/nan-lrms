// The แรกรับ form ([LR]-การบันทึกประวัติและประเมินสมรรถนะหญิงตั้งครรภ์)
// drawn section by section like docs/assessments/lr1-from.png — the history,
// the Lab grid, the risk blocks, vital sign, the examinations, the numbered
// current history and the delivery block.
//
// Every label comes from the site's own `assessment_items`; this component
// only decides where each column sits and how it reads.
'use client';

import { cn } from '@/lib/utils';
import type { AssessmentSectionSpec } from '@/config/assessment-form-layouts';
import type { MaternityAssessmentDto, MaternityAssessmentField } from '@/types/maternity-assessments';
import {
  CheckboxLine,
  FieldLine,
  MemoBox,
  PairChips,
  UnmappedFields,
  ValueBox,
  stripChoicePrefix,
  stripParenthetical,
} from './assessment-field-ui';
import { PregnancyRiskSection } from './PregnancyRiskSection';
import { groupAssessmentRecord, type GroupedFieldSection } from './group-assessment-fields';

function SectionHeading({ title }: { title: string }) {
  return <h3 className="border-b border-border pb-1 text-label font-semibold text-brand">{title}</h3>;
}

/** The Lab grid — rows × (มารดา: LAB1 / LAB2 / ข้อความ). */
function LabTable({ spec, fields }: { spec: AssessmentSectionSpec; fields: MaternityAssessmentField[] }) {
  const rows = (spec.labRows ?? []).map((row) => {
    const cells = row.cells.map((column) => fields.find((field) => field.column === column) ?? null);
    const named = cells.find((field) => field !== null) ?? null;
    return named ? { label: stripParenthetical(named.label), cells } : null;
  }).filter((row) => row !== null);

  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[26rem] border-collapse text-label">
        <thead>
          <tr className="bg-surface-muted">
            <th rowSpan={2} scope="col" className="border border-border px-2 py-1 text-caption font-semibold text-ink-muted">
              Lab
            </th>
            <th colSpan={2} scope="colgroup" className="border border-border px-2 py-1 text-caption font-semibold text-ink-muted">
              มารดา
            </th>
            <th rowSpan={2} scope="col" className="border border-border px-2 py-1 text-caption font-semibold text-ink-muted">
              ข้อความ
            </th>
          </tr>
          <tr className="bg-surface-muted">
            <th scope="col" className="border border-border px-2 py-1 text-caption font-semibold text-ink-muted">LAB1</th>
            <th scope="col" className="border border-border px-2 py-1 text-caption font-semibold text-ink-muted">LAB2</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`${spec.id}-lab-${rowIndex}`}>
              <th scope="row" className="border border-border bg-surface-card px-2 py-1 text-left text-caption text-ink">
                {row.label}
              </th>
              {row.cells.map((field, i) => (
                <td
                  key={field?.column ?? `empty-${i}`}
                  title={field?.label}
                  className="border border-border bg-surface-card px-2 py-1 tabular-nums text-ink"
                >
                  {field?.value ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskBlocks({ spec, fields }: { spec: AssessmentSectionSpec; fields: MaternityAssessmentField[] }) {
  const byColumn = new Map(fields.map((field) => [field.column, field]));
  return (
    <div className="flex flex-col gap-2">
      {(spec.riskBlocks ?? []).map((block, i) => {
        const noField = block.noColumn ? byColumn.get(block.noColumn) : undefined;
        const yesField = block.yesColumn ? byColumn.get(block.yesColumn) : undefined;
        const memoField = block.memoColumn ? byColumn.get(block.memoColumn) : undefined;
        if (!noField && !yesField && !memoField) return null;
        const title =
          memoField?.label ?? stripChoicePrefix((yesField ?? noField)?.label ?? '');
        return (
          <div key={`${spec.id}-risk-${i}`} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface-muted/40 p-2.5">
            {title && <p className="text-label font-semibold text-ink">{title}</p>}
            {(noField || yesField) && <PairChips noField={noField} yesField={yesField} />}
            {memoField && <MemoBox field={memoField} />}
          </div>
        );
      })}
    </div>
  );
}

function FieldsSection({ fields }: { fields: MaternityAssessmentField[] }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.column} className={cn('min-w-0', field.component === 'Memo' && 'sm:col-span-2')}>
          {field.component === 'CheckBox' ? (
            <CheckboxLine field={field} />
          ) : field.component === 'Memo' ? (
            <MemoBox field={field} />
          ) : (
            <FieldLine field={field} />
          )}
        </div>
      ))}
    </div>
  );
}

function VitalRow({ fields }: { fields: MaternityAssessmentField[] }) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
      {fields.map((field) => (
        <ValueBox key={field.column} field={field} />
      ))}
    </div>
  );
}

function SectionView({ section }: { section: GroupedFieldSection }) {
  const { spec, fields } = section;
  return (
    <section className="flex flex-col gap-2">
      <SectionHeading title={spec.title} />
      {spec.style === 'lab-table' && (
        <>
          <LabTable spec={spec} fields={fields} />
          {spec.columns && (
            <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-3">
              {fields
                .filter((field) => spec.columns?.includes(field.column))
                .map((field) => (
                  <FieldLine key={field.column} field={field} />
                ))}
            </div>
          )}
        </>
      )}
      {spec.style === 'risk-blocks' && <RiskBlocks spec={spec} fields={fields} />}
      {spec.style === 'numbered-risk' && <PregnancyRiskSection spec={spec} fields={fields} />}
      {spec.style === 'vital-row' && <VitalRow fields={fields} />}
      {spec.style === 'fields' && <FieldsSection fields={fields} />}
    </section>
  );
}

export function FirstPregnantFormView({ record }: { record: MaternityAssessmentDto }) {
  const grouped = groupAssessmentRecord(record);
  if (grouped.kind !== 'fields') return null;
  return (
    <div className="flex flex-col gap-4">
      {grouped.sections.map((section) => (
        <SectionView key={section.spec.id} section={section} />
      ))}
      <UnmappedFields fields={grouped.unmapped} />
    </div>
  );
}
