// src/components/patient/detail/ReferralHistoryCard.tsx
// The journey's referrals: the same rows and chips as the /referrals board.
'use client';

import Link from 'next/link';
import { SectionCard } from '@/components/shared/SectionCard';
import { FlagChip } from '@/components/shared/FlagChip';
import { Pill, STATUS_META, URGENCY_META } from '@/components/referrals/chips';
import type { PatientDetailResponse } from '@/types/api';
import { fmtDateTimeTh } from './format';

type Referral = NonNullable<PatientDetailResponse['journeyContext']>['referrals'][number];

export function ReferralHistoryCard({ referrals }: { referrals: Referral[] }) {
  return (
    <SectionCard
      title="การส่งต่อ"
      description={`${referrals.length} รายการ · สถานะเดียวกับกระดานส่งต่อ`}
      actions={
        <Link href="/referrals" className="text-label text-brand hover:underline">
          ดูกระดานส่งต่อ →
        </Link>
      }
    >
      <ul className="flex flex-col gap-2">
        {referrals.map((ref) => (
          <li key={ref.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Pill meta={STATUS_META[ref.status]} fallback={ref.status} />
            <Pill meta={URGENCY_META[ref.urgencyLevel]} fallback={ref.urgencyLevel} />
            <span className="text-label font-semibold text-ink">{ref.referNumber ?? '—'}</span>
            <span className="text-label text-ink-muted">
              {ref.fromHospital} → {ref.toHospital}
            </span>
            {ref.diagnosisCode && <FlagChip color="var(--brand)">{ref.diagnosisCode}</FlagChip>}
            {ref.reason && <span className="max-w-[24rem] truncate text-caption text-ink-muted">{ref.reason}</span>}
            <span className="ml-auto text-caption text-ink-muted">
              ส่งเมื่อ {fmtDateTimeTh(ref.initiatedAt)}
              {ref.arrivedAt ? ` · ถึงเมื่อ ${fmtDateTimeTh(ref.arrivedAt)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

