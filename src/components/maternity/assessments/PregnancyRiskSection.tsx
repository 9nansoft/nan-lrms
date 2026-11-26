// Pregnancy and delivery risk section (items 1–16 on LR1 แรกรับ):
// renders a concise Thai text summary inline and opens a modal with the full
// 1–16 checklist (grouped under ประวัติอดีต 1–6 and ประวัติปัจจุบัน 7–16)
// when the clinician wants to inspect every item.
'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/config/status-tone';
import type { AssessmentSectionSpec } from '@/config/assessment-form-layouts';
import type { MaternityAssessmentField } from '@/types/maternity-assessments';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldLine, PairChips, isCheckboxTrue, stripChoicePrefix } from './assessment-field-ui';

export type PregnancyRiskStatus = 'yes' | 'no' | 'unrecorded';

export interface PregnancyRiskItem {
  itemNumber: number;
  group: string;
  key: string;
  text: string;
  status: PregnancyRiskStatus;
  noField?: MaternityAssessmentField;
  yesField?: MaternityAssessmentField;
  specifyField?: MaternityAssessmentField;
  hasData: boolean;
}

export interface PregnancyRiskSummary {
  totalCount: number;
  recordedItems: PregnancyRiskItem[];
  yesItems: PregnancyRiskItem[];
  noItems: PregnancyRiskItem[];
  unrecordedCheckedCount: number;
  missingItemNumbers: number[];
  orphanSpecifyItems: PregnancyRiskItem[];
  extraSpecify: MaternityAssessmentField[];
  headline: string;
  summaryText: string;
  tone: Extract<StatusTone, 'warn' | 'ok' | 'neutral'>;
}

function isGenericChoiceWord(text: string): boolean {
  const normalized = text.trim();
  return normalized === '' || normalized === 'ไม่มี' || normalized === 'มี';
}

function extractItemText(
  noField?: MaternityAssessmentField,
  yesField?: MaternityAssessmentField,
): string {
  const candidates = [yesField, noField].filter((f): f is MaternityAssessmentField => f !== undefined);
  for (const candidate of candidates) {
    const cleaned = stripChoicePrefix(candidate.label).replace(/^\d+[.)]\s*/, '').trim();
    if (!isGenericChoiceWord(cleaned) && cleaned !== candidate.column) {
      return cleaned;
    }
  }
  const fallback = candidates[0];
  if (!fallback) return '';
  return stripChoicePrefix(fallback.label).replace(/^\d+[.)]\s*/, '').trim();
}

export function buildPregnancyRiskSummary(
  spec: AssessmentSectionSpec,
  fields: readonly MaternityAssessmentField[],
): PregnancyRiskSummary {
  const byColumn = new Map(fields.map((field) => [field.column, field]));
  const pairs = spec.numberedPairs ?? [];

  const allItems: PregnancyRiskItem[] = pairs.map((pair, idx) => {
    const noField = byColumn.get(pair.noColumn);
    const yesField = byColumn.get(pair.yesColumn);
    const specifyField = pair.specifyColumn ? byColumn.get(pair.specifyColumn) : undefined;
    const yesChecked = yesField !== undefined && isCheckboxTrue(yesField);
    const noChecked = noField !== undefined && isCheckboxTrue(noField);
    const status: PregnancyRiskStatus = yesChecked ? 'yes' : noChecked ? 'no' : 'unrecorded';

    return {
      itemNumber: pair.itemNumber ?? idx + 1,
      group: pair.group ?? 'รายการประเมิน',
      key: pair.noColumn,
      text: extractItemText(noField, yesField),
      status,
      noField,
      yesField,
      specifyField,
      hasData: noField !== undefined || yesField !== undefined || specifyField !== undefined,
    };
  });

  const recordedItems = allItems.filter((item) => item.hasData);
  const yesItems = recordedItems.filter((item) => item.status === 'yes');
  const noItems = recordedItems.filter((item) => item.status === 'no');
  const unrecordedCheckedCount = recordedItems.filter((item) => item.status === 'unrecorded').length;
  const missingItemNumbers = allItems.filter((item) => !item.hasData).map((item) => item.itemNumber);
  const orphanSpecifyItems = recordedItems.filter(
    (item) => item.status !== 'yes' && item.specifyField !== undefined,
  );
  const extraSpecify = (spec.numberedSpecifyColumns ?? [])
    .map((column) => byColumn.get(column))
    .filter((field): field is MaternityAssessmentField => field !== undefined);

  const totalCount = pairs.length;
  let headline: string;
  let summaryText: string;
  let tone: PregnancyRiskSummary['tone'];

  if (yesItems.length > 0) {
    tone = 'warn';
    headline = `พบความเสี่ยง ${yesItems.length} ข้อ`;
    summaryText = yesItems
      .map((item) => {
        const title = item.text ? `ข้อ ${item.itemNumber} ${item.text}` : `ข้อ ${item.itemNumber}`;
        return item.specifyField ? `${title} (ระบุ: ${item.specifyField.value})` : title;
      })
      .join(' · ');
  } else if (noItems.length > 0) {
    tone = 'ok';
    headline = 'ไม่พบความเสี่ยง';
    summaryText =
      noItems.length === totalCount
        ? `ไม่พบความเสี่ยง (ไม่มีทั้ง ${totalCount} ข้อ)`
        : `ไม่พบความเสี่ยงในข้อที่ประเมิน (ไม่มี ${noItems.length}/${totalCount} ข้อ)`;
  } else {
    tone = 'neutral';
    headline = 'ยังไม่ได้เลือกผลประเมิน';
    summaryText = `ยังไม่มีรายการที่เลือกไม่มี/มี (${recordedItems.length}/${totalCount} ข้อ)`;
  }

  return {
    totalCount,
    recordedItems,
    yesItems,
    noItems,
    unrecordedCheckedCount,
    missingItemNumbers,
    orphanSpecifyItems,
    extraSpecify,
    headline,
    summaryText,
    tone,
  };
}

function groupRecordedItems(items: readonly PregnancyRiskItem[]): Array<{ group: string; items: PregnancyRiskItem[] }> {
  const groups: Array<{ group: string; items: PregnancyRiskItem[] }> = [];
  for (const item of items) {
    const existing = groups.find((g) => g.group === item.group);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.push({ group: item.group, items: [item] });
    }
  }
  return groups;
}

export function PregnancyRiskSection({
  spec,
  fields,
}: {
  spec: AssessmentSectionSpec;
  fields: MaternityAssessmentField[];
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(() => buildPregnancyRiskSummary(spec, fields), [spec, fields]);
  const groupedItems = useMemo(() => groupRecordedItems(summary.recordedItems), [summary.recordedItems]);

  if (summary.recordedItems.length === 0 && summary.extraSpecify.length === 0) {
    return null;
  }

  return (
    <>
      <div className={cn('flex flex-col gap-2 rounded-lg border p-3', STATUS_TONE[summary.tone].chip)}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {summary.tone === 'warn' ? (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : summary.tone === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <ListChecks className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span className="text-label font-semibold">{summary.headline}</span>
            {summary.yesItems.length > 0 && summary.noItems.length > 0 && (
              <span className="rounded-full border border-border bg-surface-card px-2 py-0.5 text-caption tabular-nums text-ink-muted">
                ไม่มี {summary.noItems.length} ข้อ
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            className="bg-surface-card text-ink hover:bg-surface-muted"
          >
            ดูรายละเอียด ({summary.totalCount} ข้อ)
          </Button>
        </div>

        <p className="text-label leading-relaxed text-ink">{summary.summaryText}</p>

        {(summary.orphanSpecifyItems.length > 0 || summary.extraSpecify.length > 0) && (
          <div className="flex flex-col gap-1 border-t border-border/70 pt-2 text-ink">
            {summary.orphanSpecifyItems.map(
              (item) =>
                item.specifyField && (
                  <p key={item.specifyField.column} className="text-label leading-relaxed">
                    <span className="text-ink-muted">
                      ข้อ {item.itemNumber} ({item.specifyField.label}):{' '}
                    </span>
                    <span>{item.specifyField.value}</span>
                  </p>
                ),
            )}
            {summary.extraSpecify.map((field) => (
              <FieldLine key={field.column} field={field} />
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden bg-surface-card p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border bg-surface-muted/50 px-5 py-3.5 pr-12">
            <DialogTitle className="text-body-lg font-semibold text-brand">{spec.title}</DialogTitle>
            <DialogDescription className="text-caption tabular-nums text-ink-muted">
              พบความเสี่ยง {summary.yesItems.length} ข้อ · ไม่มี {summary.noItems.length} ข้อ
              {summary.unrecordedCheckedCount > 0 ? ` · ยังไม่ได้เลือก ${summary.unrecordedCheckedCount} ข้อ` : ''}
              {` (จากทั้งหมด ${summary.totalCount} ข้อ)`}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {groupedItems.map(({ group, items }) => (
              <section key={group} className="flex flex-col gap-2">
                <h4 className="border-b border-border pb-1 text-label font-semibold text-brand">
                  {group}
                </h4>
                <ol className="flex flex-col gap-1.5">
                  {items.map((item) => (
                    <li
                      key={item.key}
                      className={cn(
                        'flex flex-wrap items-start gap-x-2 gap-y-1 rounded-lg px-2.5 py-1.5 text-label text-ink',
                        item.status === 'yes' && 'border border-warn/50 bg-warn-tint/60',
                      )}
                    >
                      <span className="w-6 shrink-0 text-right text-caption font-medium tabular-nums text-ink-muted">
                        {item.itemNumber}.
                      </span>
                      <div className="min-w-0 flex-1">
                        <span>{item.text || `ข้อ ${item.itemNumber}`}</span>
                        {item.specifyField && (
                          <p className="mt-0.5 text-caption text-ink-muted">
                            {item.specifyField.label}:{' '}
                            <span className="font-medium text-ink">{item.specifyField.value}</span>
                          </p>
                        )}
                      </div>
                      <PairChips noField={item.noField} yesField={item.yesField} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}

            {summary.extraSpecify.length > 0 && (
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border pt-3 sm:grid-cols-2">
                {summary.extraSpecify.map((field) => (
                  <FieldLine key={field.column} field={field} />
                ))}
              </div>
            )}

            {summary.missingItemNumbers.length > 0 && (
              <p className="border-t border-border pt-3 text-caption tabular-nums text-ink-muted">
                ยังไม่มีข้อมูลบันทึกใน HOSxP: ข้อ {summary.missingItemNumbers.join(', ')}
              </p>
            )}
          </div>

          <DialogFooter className="mx-0 mb-0 rounded-b-xl border-t border-border bg-surface-muted/40 px-5 py-3">
            <DialogClose render={<Button type="button" variant="outline" size="sm" />}>
              ปิด
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
