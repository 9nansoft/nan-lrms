// Maternity assessment forms (HOSxP [LR]) as cached by the assessment sync.
//
// Every field carries the label HOSxP's own form defines for it (resolved
// from `assessment_items` at pull time), so this card renders whatever the
// site recorded — no field list is hardcoded here.
'use client';

import { ClipboardList } from 'lucide-react';
import { SectionCard } from '@/components/shared/SectionCard';
import { AssessmentForms } from '@/components/maternity/AssessmentForms';
import type { MaternityAssessmentDto } from '@/types/maternity-assessments';

export interface MaternityAssessmentCardProps {
  assessments: MaternityAssessmentDto[];
  isLoading?: boolean;
  error?: unknown;
}

export function MaternityAssessmentCard({
  assessments,
  isLoading,
  error,
}: MaternityAssessmentCardProps) {
  return (
    <SectionCard
      title="แบบฟอร์มประเมิน (LR)"
      description={
        error
          ? 'ดึงข้อมูลแบบฟอร์มประเมินไม่สำเร็จ — ข้อมูลส่วนอื่นยังใช้ได้ตามปกติ'
          : `แหล่งข้อมูล: HOSxP · ${assessments.length} รายการ`
      }
      testId="maternity-assessment-card"
      actions={<ClipboardList aria-hidden="true" className="h-5 w-5 text-brand" />}
    >
      {isLoading && <p className="text-label text-ink-muted">กำลังโหลดแบบฟอร์มประเมิน…</p>}

      {!isLoading && !error && (
        <AssessmentForms assessments={assessments} emptyMessage="ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา" />
      )}
    </SectionCard>
  );
}
