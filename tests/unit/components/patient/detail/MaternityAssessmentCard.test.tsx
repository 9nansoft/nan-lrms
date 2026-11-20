/* @vitest-environment jsdom */
// Maternity assessment card — renders the labelled fields the sync stored.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MaternityAssessmentCard } from '@/components/patient/detail/MaternityAssessmentCard';
import type { MaternityAssessmentDto } from '@/types/maternity-assessments';

function dto(over: Partial<MaternityAssessmentDto> = {}): MaternityAssessmentDto {
  return {
    id: 'a-1',
    formKey: 'after_birth',
    formTable: 'asm_lr_record_after_birth_nan',
    formName: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
    recordedAt: '2026-11-17T21:03:15.000Z',
    recordedDate: '2026-11-17',
    entryStaff: 'jcome',
    fields: [
      {
        column: 'asm_text2',
        label: 'Systolic',
        component: 'TextEdit',
        dataType: 'VARCHAR(250)',
        value: '138',
        encrypted: false,
      },
      {
        column: 'asm_chk1',
        label: 'ได้ให้อาหารทางปาก',
        component: 'CheckBox',
        dataType: 'VARCHAR(100)',
        value: 'Y',
        encrypted: false,
      },
      {
        column: 'asm_chk2',
        label: 'ไม่ได้ให้อาหารทางปาก',
        component: 'CheckBox',
        dataType: 'VARCHAR(100)',
        value: 'N',
        encrypted: false,
      },
      {
        column: 'asm_memo3',
        label: 'มดลูกหดรัดตัวดี',
        component: 'Memo',
        dataType: 'VARCHAR(500)',
        value: 'มดลูกหดรัดตัวดี',
        encrypted: false,
      },
    ],
    ...over,
  };
}

describe('MaternityAssessmentCard', () => {
  it('shows the form title, the label and the value of every field', () => {
    render(<MaternityAssessmentCard assessments={[dto()]} />);
    expect(screen.getByText('หลังคลอด')).toBeTruthy();
    expect(screen.getByText('Systolic')).toBeTruthy();
    expect(screen.getByText('138')).toBeTruthy();
    // The memo label and its value are the same string in this fixture.
    expect(screen.getAllByText('มดลูกหดรัดตัวดี').length).toBeGreaterThan(0);
    expect(screen.getByText('แหล่งข้อมูล: HOSxP · 1 รายการ')).toBeTruthy();
  });

  it('says a checkbox in words instead of showing Y/N', () => {
    render(<MaternityAssessmentCard assessments={[dto()]} />);
    // The checkbox line carries the tick and the site's own sentence.
    expect(screen.getByText('ได้ให้อาหารทางปาก')).toBeTruthy();
    expect(screen.getByText('ไม่ได้ให้อาหารทางปาก')).toBeTruthy();
    expect(screen.getAllByText('✓').length).toBeGreaterThan(0);
    expect(screen.getAllByText('✗').length).toBeGreaterThan(0);
  });

  it('says so when nothing has been synced yet', () => {
    render(<MaternityAssessmentCard assessments={[]} />);
    expect(screen.getByText('ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา')).toBeTruthy();
  });

  it('keeps the rest of the page usable when the feed failed', () => {
    render(<MaternityAssessmentCard assessments={[]} error={new Error('boom')} />);
    expect(screen.getByText('ดึงข้อมูลแบบฟอร์มประเมินไม่สำเร็จ — ข้อมูลส่วนอื่นยังใช้ได้ตามปกติ')).toBeTruthy();
  });

  it('groups the forms and shows how many times each was recorded', () => {
    const two = dto();
    const older = dto({ id: 'a-0', recordedAt: '2026-11-16T21:03:15.000Z' });
    render(<MaternityAssessmentCard assessments={[two, older]} />);
    // The count badge on the หลังคลอด tab (two records of that form).
    expect(screen.getByText('2')).toBeTruthy();
  });
});
