// Shared referral display chips — status/urgency pills, ANC risk chip, and
// the SLA aging chip. Used by the referrals board page and the detail dialog.
'use client';

import { formatRelativeAge } from '@/lib/relative-time';
import type { ReferralAgeClass } from '@/config/referral-sla';
import { FlagChip, type FlagTone } from '@/components/shared/FlagChip';

// Risk chip moved to shared — re-exported so existing imports keep working.
export { AncRiskChip as RiskChip } from '@/components/shared/AncRiskChip';

export interface StatusMeta {
  tone: FlagTone;
  label: string;
}

export const STATUS_META: Record<string, StatusMeta> = {
  INITIATED: { tone: 'neutral', label: 'รอดำเนินการ' },
  ACCEPTED: { tone: 'ok', label: 'ตอบรับ' },
  IN_TRANSIT: { tone: 'warn', label: 'กำลังเดินทาง' },
  ARRIVED: { tone: 'brand', label: 'ถึงแล้ว' },
  REJECTED: { tone: 'danger', label: 'ปฏิเสธ' },
  EXPIRED: { tone: 'neutral', label: 'หมดอายุ' },
};

export const URGENCY_META: Record<string, StatusMeta> = {
  ROUTINE: { tone: 'neutral', label: 'ปกติ' },
  URGENT: { tone: 'warn', label: 'เร่งด่วน' },
  EMERGENCY: { tone: 'danger', label: 'ฉุกเฉิน' },
};

export const AGE_META: Record<Exclude<ReferralAgeClass, 'fresh'>, StatusMeta> = {
  overdue: { tone: 'warn', label: 'ค้าง' },
  critical: { tone: 'danger', label: 'ค้าง' },
};

export function Pill({ meta, fallback }: { meta: StatusMeta | undefined; fallback: string }) {
  return <FlagChip tone={meta?.tone ?? 'neutral'}>{meta?.label ?? fallback}</FlagChip>;
}

/** Aging chip for INITIATED rows past SLA — "ค้าง 3 วัน" in amber/red. */
export function AgeChip({ age, initiatedAt }: { age: ReferralAgeClass; initiatedAt: string }) {
  if (age === 'fresh') return null;
  const m = AGE_META[age];
  return (
    <FlagChip tone={m.tone}>
      {m.label} {formatRelativeAge(initiatedAt, 'th')}
    </FlagChip>
  );
}
