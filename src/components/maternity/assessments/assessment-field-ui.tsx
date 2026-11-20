// Shared read-only renderers for the HOSxP maternity assessment forms.
//
// The forms are drawn (not re-keyed): each field keeps the label the site's
// own `assessment_items` gives it and renders as the line, chip or boxed
// memo its widget family calls for. Colours and sizes come from the design
// tokens (ink/border/brand), never the legacy slate-* classes.
'use client';

import type { ReactNode } from 'react';
import type { MaternityAssessmentField } from '@/types/maternity-assessments';
import { cn } from '@/lib/utils';

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

export function isCheckboxTrue(field: MaternityAssessmentField): boolean {
  return field.component === 'CheckBox' && field.value === 'Y';
}

export function isCheckboxFalse(field: MaternityAssessmentField): boolean {
  return field.component === 'CheckBox' && field.value === 'N';
}

/**
 * The item text behind a ไม่มี/มี checkbox pair. The site labels both
 * checkboxes of a pair with the same sentence ("ไม่มี (เคยชัก…)" /
 * "มี (เคยชัก…)"), so the sentence is the label minus the choice word and
 * its parentheses. A label that does not follow that shape is used as is.
 */
export function stripChoicePrefix(label: string): string {
  const withoutChoice = label.replace(/^\s*(?:ไม่มี|มี)\s*/, '');
  const parenthesized = withoutChoice.match(/^\((.*)\)\s*$/);
  const text = (parenthesized ? parenthesized[1] : withoutChoice).trim();
  return text.length > 0 ? text : label;
}

/** "Blood gr (มารดา : LAB1)" → "Blood gr" — a Lab row's shared name. */
export function stripParenthetical(label: string): string {
  const stripped = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return stripped.length > 0 ? stripped : label;
}

/** Generic value rendering (the value only, no label). */
export function AssessmentValue({ field }: { field: MaternityAssessmentField }) {
  if (field.component === 'CheckBox') {
    if (field.value === 'Y') return <span className="font-semibold text-ok-text">✓</span>;
    if (field.value === 'N') return <span className="text-ink-muted">✗</span>;
  }
  return <span className="break-words">{field.value}</span>;
}

/**
 * Checkboxes carry 'Y'/'N' — say it in words instead of showing the code.
 * (Legacy helper, kept exported for the module's old consumers.)
 */
export function renderAssessmentValue(field: MaternityAssessmentField): ReactNode {
  if (field.component === 'CheckBox') {
    if (field.value === 'Y') return <span className="font-semibold text-ok-text">✓ ใช่</span>;
    if (field.value === 'N') return <span className="text-ink-muted">✗ ไม่ใช่</span>;
  }
  if (field.component === 'Memo') {
    return <span className="whitespace-pre-wrap break-words">{field.value}</span>;
  }
  return <span className="break-words">{field.value}</span>;
}

/**
 * A checked/unticked checkbox line — the sentence IS the content, so the
 * tick mark and the ink colour carry the yes/no.
 */
export function CheckboxLine({ field }: { field: MaternityAssessmentField }) {
  if (field.value === 'Y') {
    return (
      <p className="text-label text-ok-text">
        ✓ <span>{field.label}</span>
      </p>
    );
  }
  if (field.value === 'N') {
    return (
      <p className="text-label text-ink-muted">
        ✗ <span>{field.label}</span>
      </p>
    );
  }
  return (
    <p className="text-label text-ink-muted">
      {field.label} <span className="tabular-nums">({field.value})</span>
    </p>
  );
}

/** Label and value on one wrapping line ("BP / mmHg  120/80"). */
export function FieldLine({ field, className }: { field: MaternityAssessmentField; className?: string }) {
  return (
    <p className={cn('min-w-0 text-label leading-relaxed', className)}>
      <span className="text-ink-muted">{field.label}</span>
      <span className="text-ink-muted">: </span>
      <AssessmentValue field={field} />
    </p>
  );
}

/** A free-text memo drawn as a bordered box, like the paper form's box. */
export function MemoBox({ field }: { field: MaternityAssessmentField }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-surface-card p-2">
      <p className="text-caption text-ink-muted">{field.label}</p>
      <p className="mt-0.5 whitespace-pre-wrap break-words text-label text-ink">{field.value}</p>
    </div>
  );
}

/** Compact labelled value box (the Vital sign strip). */
export function ValueBox({ field }: { field: MaternityAssessmentField }) {
  return (
    <div className="min-h-[42px] min-w-0 rounded border border-border bg-surface-card px-2 py-1.5">
      <div className="truncate text-caption text-ink-muted">{field.label}</div>
      <div className="mt-0.5 whitespace-nowrap text-label font-bold leading-none tabular-nums text-ink">
        {field.value}
      </div>
    </div>
  );
}

/** One field rendered as the line its widget family calls for. */
export function FormFieldLine({ field, className }: { field: MaternityAssessmentField; className?: string }) {
  if (field.component === 'CheckBox') return <CheckboxLine field={field} />;
  if (field.component === 'Memo') return <MemoBox field={field} />;
  return <FieldLine field={field} className={className} />;
}

/**
 * Fields the standard layout does not place — a site that extended its form
 * still shows everything it recorded, grouped under อื่น ๆ.
 */
export function UnmappedFields({ fields }: { fields: readonly MaternityAssessmentField[] }) {
  if (fields.length === 0) return null;
  return (
    <section className="rounded-xl border border-border bg-surface-card p-3">
      <h3 className="text-label font-semibold text-brand">อื่น ๆ ในแบบฟอร์ม</h3>
      <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {fields.map((field) => (
          <FormFieldLine key={field.column} field={field} />
        ))}
      </div>
    </section>
  );
}
