/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// PregnancyRiskSection — inline text summary + popup modal for the 1–16
// pregnancy and delivery risk checklist on the LR1 แรกรับ form.
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fieldLayoutFor } from '@/config/assessment-form-layouts';
import type { MaternityAssessmentField } from '@/types/maternity-assessments';
import { PregnancyRiskSection } from '@/components/maternity/assessments/PregnancyRiskSection';

const RISK_SPEC = fieldLayoutFor('first_pregnant')!.sections.find((s) => s.id === 'current-history')!;

function chk(column: string, value: 'Y' | 'N', label: string): MaternityAssessmentField {
  return { column, label, component: 'CheckBox', dataType: null, value, encrypted: false };
}

function txt(column: string, value: string, label: string): MaternityAssessmentField {
  return { column, label, component: 'TextEdit', dataType: null, value, encrypted: false };
}

const ITEM_LABELS = [
  'เคยมีทารกตายในครรภ์และเสียชีวิตแรกเกิด (1เดือนแรก)',
  'เคยแท้ง3ครั้ง ติดต่อกันหรือมากกว่าติดต่อกัน',
  'เคยคลอดบุตรน้ำหนักน้อยกว่า 2,500 กรัม',
  'เคยคลอดบุตรน้ำหนักมากกว่า 4,000 กรัม',
  'เคยเข้ารับการรักษาในรพ.ด้วย BPสูงขณะตั้งครรภ์(PIH)',
  'เคยผ่าตัดอวัยวะภายในระบบสืบพันธุ์',
  'ครรภ์แฝด',
  'อายุ <17 ปี / อายุ >35 ปี (นับถึง EDC)',
  'Rh Negative',
  'มีเลือดออกทางช่องคลอด',
  'มีก้อนในอุ้งเชิงกราน/บริเวณอวัยวะสืบพันธุ์',
  'BP >= 140/90 mmHg',
  'โรคเบาหวาน/โรคไต/โรคหัวใจ',
  'ติดยาเสพติด/ดื่มสุรา/สูบบุหรี่',
  'โรคอายุรกรรม เช่น โลหิตจาง, ธัยรอยด์, SLE',
  'โรคทางศัลยกรรม เช่น ผ่าตัดไส้ติ่ง, อุบัติเหตุ',
];

function buildAllNoFields(): MaternityAssessmentField[] {
  return (RISK_SPEC.numberedPairs ?? []).flatMap((pair, idx) => {
    const label = ITEM_LABELS[idx];
    return [
      chk(pair.noColumn, 'Y', `ไม่มี (${label})`),
      chk(pair.yesColumn, 'N', `มี (${label})`),
    ];
  });
}

describe('PregnancyRiskSection', () => {
  it('summarizes all 16 items as no-risk text and reveals grouped items in the modal', async () => {
    render(<PregnancyRiskSection spec={RISK_SPEC} fields={buildAllNoFields()} />);

    expect(screen.getByText('ไม่พบความเสี่ยง')).toBeTruthy();
    expect(screen.getByText('ไม่พบความเสี่ยง (ไม่มีทั้ง 16 ข้อ)')).toBeTruthy();
    expect(screen.queryByText('ครรภ์แฝด')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียด (16 ข้อ)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร')).toBeTruthy();
    expect(within(dialog).getByText('ประวัติอดีต')).toBeTruthy();
    expect(within(dialog).getByText('ประวัติปัจจุบัน')).toBeTruthy();
    expect(within(dialog).getByText('ครรภ์แฝด')).toBeTruthy();

    await userEvent.click(within(dialog).getByRole('button', { name: 'ปิด' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('replaces generic HOSxP placeholder labels with the 16 LR1 item descriptions', async () => {
    const fields: MaternityAssessmentField[] = (RISK_SPEC.numberedPairs ?? []).flatMap((pair) => [
      chk(pair.noColumn, pair.itemNumber === 12 ? 'N' : 'Y', `ไม่มี (การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร ข้อ ${pair.itemNumber})`),
      chk(pair.yesColumn, pair.itemNumber === 12 ? 'Y' : 'N', `มี (การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร ข้อ ${pair.itemNumber})`),
    ]);

    render(<PregnancyRiskSection spec={RISK_SPEC} fields={fields} />);

    expect(screen.getByText('พบความเสี่ยง 1 ข้อ')).toBeTruthy();
    expect(screen.getByText('ข้อ 12 BP>=140/90 mmHg')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียด (16 ข้อ)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('เคยมีทารกตายในครรภ์และเสียชีวิตแรกเกิด (1เดือนแรก)')).toBeTruthy();
    expect(within(dialog).getByText('เคยแท้ง3ครั้ง ติดต่อกันหรือมากกว่าติดต่อกัน')).toBeTruthy();
    expect(within(dialog).getByText('BP>=140/90 mmHg')).toBeTruthy();
    expect(within(dialog).getByText('โรคทางศัลยกรรม เช่น ผ่าตัดไส้ติ่ง, อุบัติเหตุ')).toBeTruthy();
  });

  it('summarizes positive risk items with specify text inline and shows all 16 items in the modal', async () => {
    const fields: MaternityAssessmentField[] = [
      chk('asm_chk15', 'Y', 'ไม่มี (1. เคยมีทารกตายในครรภ์)'),
      chk('asm_chk16', 'N', 'มี (1. เคยมีทารกตายในครรภ์)'),
      chk('asm_chk25', 'N', 'ไม่มี'),
      chk('asm_chk26', 'Y', 'มี (6. เคยผ่าตัดอวัยวะภายในระบบสืบพันธุ์)'),
      txt('asm_text56', 'ผ่าตัดคลอด ปี 2566', 'ระบุ การผ่าตัดปากมดลูก, ผูกปากมดลูก, ผ่าตัดคลอด'),
      chk('asm_chk43', 'N', 'ไม่มี (โรคอายุรกรรม เช่น โลหิตจาง, ธัยรอยด์, SLE)'),
      chk('asm_chk44', 'Y', 'มี (โรคอายุรกรรม เช่น โลหิตจาง, ธัยรอยด์, SLE)'),
      txt('asm_text57', 'ธัยรอยด์', 'ระบุ โรคอายุรกรรม เช่น โลหิตจาง, ธัยรอยด์, SLE'),
    ];

    render(<PregnancyRiskSection spec={RISK_SPEC} fields={fields} />);

    expect(screen.getByText('พบความเสี่ยง 2 ข้อ')).toBeTruthy();
    expect(screen.getByText('ไม่มี 1 ข้อ')).toBeTruthy();
    expect(
      screen.getByText(
        'ข้อ 6 เคยผ่าตัดอวัยวะภายในระบบสืบพันธุ์ (ระบุ: ผ่าตัดคลอด ปี 2566) · ข้อ 15 โรคอายุรกรรม เช่น โลหิตจาง, ธัยรอยด์, SLE (ระบุ: ธัยรอยด์)',
      ),
    ).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียด (16 ข้อ)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('เคยมีทารกตายในครรภ์')).toBeTruthy();
    expect(within(dialog).getByText('เคยผ่าตัดอวัยวะภายในระบบสืบพันธุ์')).toBeTruthy();
    expect(within(dialog).getByText('ผ่าตัดคลอด ปี 2566')).toBeTruthy();
    expect(within(dialog).getByText('ธัยรอยด์')).toBeTruthy();
    expect(within(dialog).getByText('ประเมินแล้ว 3/16 ข้อ', { exact: false })).toBeTruthy();
    // Unrecorded items still appear with their standard LR1 text under ประวัติอดีต / ประวัติปัจจุบัน.
    expect(within(dialog).getByText('ครรภ์แฝด')).toBeTruthy();
  });

  it('shows unassessed message and still preserves extra specify notes when checkboxes are unticked', async () => {
    const fields: MaternityAssessmentField[] = [
      chk('asm_chk15', 'N', 'ไม่มี (เคยมีทารกตายในครรภ์)'),
      chk('asm_chk16', 'N', 'มี (เคยมีทารกตายในครรภ์)'),
      txt('asm_text61', 'มีประวัติแพ้ยาเพนิซิลลิน', 'ระบุข้ออื่นๆ'),
    ];

    render(<PregnancyRiskSection spec={RISK_SPEC} fields={fields} />);

    expect(screen.getByText('ยังไม่ได้เลือกผลประเมิน')).toBeTruthy();
    expect(screen.getByText('มีประวัติแพ้ยาเพนิซิลลิน')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'ดูรายละเอียด (16 ข้อ)' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('เคยมีทารกตายในครรภ์')).toBeTruthy();
    expect(within(dialog).getByText('มีประวัติแพ้ยาเพนิซิลลิน')).toBeTruthy();
  });
});
