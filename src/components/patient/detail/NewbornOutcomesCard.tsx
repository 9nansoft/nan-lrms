// src/components/patient/detail/NewbornOutcomesCard.tsx
// Birth outcomes from the newborn sync. LBW / low-Apgar flags use
// NEWBORN_THRESHOLDS (same definition as the outcomes page).
'use client';

import { Baby } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { FlagChip } from '@/components/shared/FlagChip';
import { HintButton } from '@/components/shared/HintButton';
import { NEWBORN_THRESHOLDS } from '@/config/newborn';
import type { PatientDetailResponse } from '@/types/api';
import { cn } from '@/lib/utils';
import { fmtDateTimeTh } from './format';

type Newborn = NonNullable<PatientDetailResponse['journeyContext']>['newborns'][number];
const SEX_TH: Record<string, string> = { M: 'ชาย', F: 'หญิง' };

export function NewbornOutcomesCard({ newborns }: { newborns: Newborn[] }) {
  return (
    <SectionCard
      title="ทารกแรกเกิด"
      description={`${newborns.length} ราย`}
      actions={
        <HintButton
          label="ทารกแรกเกิด"
          title="ทารกแรกเกิด"
          body={`ผลลัพธ์การคลอดจากระบบซิงก์ทารกแรกเกิด — LBW = น้ำหนักแรกเกิดต่ำกว่า ${NEWBORN_THRESHOLDS.lbwGrams.toLocaleString('th-TH')} กรัม และ Apgar นาทีที่ 5 ต่ำกว่า ${NEWBORN_THRESHOLDS.apgarLowAt5min} ควรติดตามภาวะแทรกซ้อน (นิยามเดียวกับหน้าผลลัพธ์ทารก)`}
        />
      }
    >
      <ul className="flex flex-col gap-2">
        {newborns.map((nb) => {
          const lbw = nb.birthWeightG != null && nb.birthWeightG < NEWBORN_THRESHOLDS.lbwGrams;
          const lowApgar = nb.apgar5min != null && nb.apgar5min < NEWBORN_THRESHOLDS.apgarLowAt5min;
          return (
            <li
              key={nb.infantNumber}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-xl border border-border border-l-4 px-3 py-2',
                lbw || lowApgar ? 'border-l-danger' : 'border-l-ok',
              )}
            >
              <Baby aria-hidden="true" className="h-4 w-4 text-brand" />
              <span className="text-label font-semibold text-ink">ทารกคนที่ {nb.infantNumber}</span>
              <span className="text-label text-ink-muted">เพศ{SEX_TH[nb.sex ?? ''] ?? 'ไม่ระบุ'}</span>
              <span className={cn('text-label font-semibold tabular-nums', lbw ? 'text-danger-text' : 'text-ink')}>
                {nb.birthWeightG != null ? `${nb.birthWeightG.toLocaleString('th-TH')} กรัม` : 'น้ำหนัก —'}
              </span>
              {lbw && <FlagChip color="var(--risk-high)">LBW</FlagChip>}
              <span
                data-testid={`newborn-apgar-${nb.infantNumber}`}
                data-low={lowApgar ? 'true' : 'false'}
                className={cn('text-label tabular-nums', lowApgar ? 'font-semibold text-danger-text' : 'text-ink-muted')}
              >
                Apgar {nb.apgar1min ?? '—'} / {nb.apgar5min ?? '—'}
              </span>
              {lowApgar && <FlagChip color="var(--risk-high)">Apgar &lt;{NEWBORN_THRESHOLDS.apgarLowAt5min}</FlagChip>}
              <span className="ml-auto text-caption text-ink-muted">เกิดเมื่อ {fmtDateTimeTh(nb.bornAt)}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}

