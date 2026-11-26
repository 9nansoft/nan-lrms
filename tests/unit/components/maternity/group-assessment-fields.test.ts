// groupAssessmentRecord — the pure grouping behind the assessment viewer.
//
// Known columns land in the layout's own order; anything the standard form
// structure does not name survives in `unmapped` so a site-customised form
// never loses what it recorded.
import { describe, it, expect } from 'vitest';
import { groupAssessmentRecord } from '@/components/maternity/assessments/group-assessment-fields';
import type { MaternityAssessmentDto, MaternityAssessmentField } from '@/types/maternity-assessments';

function field(column: string, value: string, component: MaternityAssessmentField['component'] = 'TextEdit'): MaternityAssessmentField {
  return { column, label: column, component, dataType: null, value, encrypted: false };
}

function record(formKey: MaternityAssessmentDto['formKey'], fields: MaternityAssessmentField[]): MaternityAssessmentDto {
  return {
    id: `${formKey}:1`,
    formKey,
    formTable: formKey,
    formName: formKey,
    recordedAt: '2026-11-17T21:03:15.000Z',
    recordedDate: null,
    entryStaff: null,
    fields,
  };
}

describe('groupAssessmentRecord', () => {
  it('places the แรกรับ columns into their sections, in layout order', () => {
    const grouped = groupAssessmentRecord(
      record('first_pregnant', [
        field('asm_text5', '2569-01-10'),
        field('asm_text1', '2'),
        field('asm_memo5', 'preeclampsia watch'),
        field('asm_chk15', 'Y', 'CheckBox'),
        field('asm_text99', 'custom'),
      ]),
    );

    expect(grouped.kind).toBe('fields');
    if (grouped.kind !== 'fields') return;

    const history = grouped.sections.find((s) => s.spec.id === 'history');
    expect(history?.fields.map((f) => f.column)).toEqual(['asm_text1', 'asm_text5']);

    // การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร picks up the first numbered pair.
    const current = grouped.sections.find((s) => s.spec.id === 'current-history');
    expect(current?.spec.title).toBe('การประเมินความเสี่ยงสตรีตั้งครรภ์ และการคลอดบุตร');
    expect(current?.fields.map((f) => f.column)).toEqual(['asm_chk15']);

    // Problem Lists is its own section.
    const problems = grouped.sections.find((s) => s.spec.id === 'problems');
    expect(problems?.fields.map((f) => f.column)).toEqual(['asm_memo5']);

    // Nothing is dropped — the unknown column stays in unmapped.
    expect(grouped.unmapped.map((f) => f.column)).toEqual(['asm_text99']);
  });

  it('puts the Lab cells of one row together under their shared name', () => {
    const grouped = groupAssessmentRecord(
      record('first_pregnant', [
        field('asm_text14', 'A'),
        field('asm_text21', 'O'),
        field('asm_text29', 'AB'),
      ]),
    );
    expect(grouped.kind).toBe('fields');
    if (grouped.kind !== 'fields') return;

    const lab = grouped.sections.find((s) => s.spec.id === 'lab');
    expect(lab?.fields.map((f) => f.column)).toEqual(['asm_text14', 'asm_text21', 'asm_text29']);
  });

  it('aligns LR1 BMI, Vital sign, specify fields, and Dx to lr1-colum.png columns', () => {
    const grouped = groupAssessmentRecord(
      record('first_pregnant', [
        field('asm_text13', '24.5'),
        field('asm_text36', 'G6PD normal'),
        field('asm_text37', '120/80'),
        field('asm_text42', '2'),
        field('asm_text55', 'Good'),
        field('asm_text56', 'เคยผ่าตัดคลอด'),
        field('asm_text57', 'โลหิตจาง'),
        field('asm_text61', 'อื่นๆ'),
        field('asm_text62', 'G1P0 term labour'),
      ]),
    );
    expect(grouped.kind).toBe('fields');
    if (grouped.kind !== 'fields') return;

    expect(grouped.sections.find((s) => s.spec.id === 'history')?.fields.map((f) => f.column)).toEqual(['asm_text13']);
    expect(grouped.sections.find((s) => s.spec.id === 'lab')?.fields.map((f) => f.column)).toEqual(['asm_text36']);
    expect(grouped.sections.find((s) => s.spec.id === 'vital')?.fields.map((f) => f.column)).toEqual([
      'asm_text37',
      'asm_text42',
    ]);
    expect(grouped.sections.find((s) => s.spec.id === 'appearance')?.fields.map((f) => f.column)).toEqual([
      'asm_text55',
    ]);
    expect(grouped.sections.find((s) => s.spec.id === 'current-history')?.fields.map((f) => f.column)).toEqual([
      'asm_text56',
      'asm_text57',
      'asm_text61',
    ]);
    expect(grouped.sections.find((s) => s.spec.id === 'dx')?.fields.map((f) => f.column)).toEqual(['asm_text62']);
  });

  it('walks the หลังคลอด grid row by row and leaves empty rows out', () => {
    const grouped = groupAssessmentRecord(
      record('after_birth', [
        field('asm_date1', '2026-11-18', 'DateEdit'),
        field('asm_time1', '08:30:00', 'TimeEdit'),
        field('asm_lk1', 'ศุภิสรา', 'LookupComboBox'),
        field('asm_chk1', 'Y', 'CheckBox'),
        // ครั้งที่ 4: the Void time is part of that row's activity list.
        field('asm_time4', '14:00:00', 'TimeEdit'),
        field('asm_time6', '15:10:00', 'TimeEdit'),
        field('asm_lk6', 'แพทย์หญิงชญานิษฐ์', 'LookupComboBox'),
        field('asm_text97', 'custom'),
      ]),
    );

    expect(grouped.kind).toBe('time-rows');
    if (grouped.kind !== 'time-rows') return;

    expect(grouped.dateField?.column).toBe('asm_date1');
    expect(grouped.rows.filter((r) => r.hasContent).map((r) => r.index)).toEqual([1, 4]);
    expect(grouped.rows[0].staffField?.value).toBe('ศุภิสรา');
    expect(grouped.rows[3].activityFields.map((f) => f.column)).toContain('asm_time6');

    // The attending physician sits in the identity strip, not in a row.
    expect(grouped.footerFields.map((f) => f.column)).toEqual(['asm_lk6']);
    expect(grouped.unmapped.map((f) => f.column)).toEqual(['asm_text97']);
  });

  it('keeps every column of a ระยะคลอด row in the order the form draws it', () => {
    const grouped = groupAssessmentRecord(
      record('birth_period', [
        field('asm_time2', '11:20:00', 'TimeEdit'),
        field('asm_lk2', 'สดใส', 'LookupComboBox'),
        field('asm_text3', '3500'),
        field('asm_chk1', 'Y', 'CheckBox'),
        field('asm_text7', '51'),
        field('asm_memo2', 'ทารกคลอดปกติ'),
      ]),
    );

    expect(grouped.kind).toBe('time-rows');
    if (grouped.kind !== 'time-rows') return;

    const row2 = grouped.rows.find((r) => r.index === 2);
    expect(row2?.subjectFields.map((f) => f.column)).toEqual([
      'asm_text3',
      'asm_chk1',
      'asm_text7',
      'asm_memo2',
    ]);
  });
});
