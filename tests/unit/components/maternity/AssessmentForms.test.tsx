/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// AssessmentForms — the three [LR] nursing forms as tabs (แรกรับ / ระยะคลอด /
// หลังคลอด), each drawn like its HOSxP form.
//
// The title of a form comes from the config (MATERNITY_ASSESSMENT_FORMS), so
// there is ONE source of truth for it — the component keeps no second map of
// its own. All three tab panels stay mounted (keepMounted), so the ward can
// render a หลังคลอด record while the แรกรับ tab is the active one.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MaternityAssessmentDto, MaternityAssessmentField } from '@/types/maternity-assessments';
import { AssessmentForms } from '@/components/maternity/AssessmentForms';

function field(column: string, value: string, component: MaternityAssessmentField['component'] = 'TextEdit', label = column): MaternityAssessmentField {
  return { column, label, component, dataType: null, value, encrypted: false };
}

const FIRST_PREGNANT: MaternityAssessmentDto = {
  id: 'asm_first_pregnant_pt_nan:1',
  formKey: 'first_pregnant',
  formTable: 'asm_first_pregnant_pt_nan',
  formName: '[LR]-แรกรับ',
  recordedAt: '2026-11-17T21:03:15.000Z',
  recordedDate: '2026-11-17',
  entryStaff: 'jcome',
  fields: [
    field('asm_text2', '138', 'TextEdit', 'Systolic'),
    // The Lab grid, one row: Blood gr × (LAB1 / LAB2 / ข้อความ)
    field('asm_text13', 'A', 'TextEdit', 'Blood gr (มารดา : LAB1)'),
    field('asm_text21', 'O', 'TextEdit', 'Blood gr (มารดา : LAB2)'),
    field('asm_text29', 'AB', 'TextEdit', 'Blood gr (อื่น)'),
    // A ไม่มี/มี pair of the numbered current history
    field('asm_chk15', 'Y', 'CheckBox', 'ไม่มี (เคยชัก/มึนงง หลังคลอด)'),
    field('asm_chk16', 'N', 'CheckBox', 'มี (เคยชัก/มึนงง หลังคลอด)'),
    // A column the standard layout does not name must not be lost.
    field('asm_text99', 'custom note'),
  ],
};

const AFTER_BIRTH: MaternityAssessmentDto = {
  id: 'asm_lr_record_after_birth_nan:1',
  formKey: 'after_birth',
  formTable: 'asm_lr_record_after_birth_nan',
  formName: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
  recordedAt: '2026-11-18T09:00:00.000Z',
  recordedDate: '2026-11-18',
  entryStaff: 'jcome',
  fields: [
    field('asm_date1', '2026-11-18', 'DateEdit', 'วันที่'),
    field('asm_time1', '08:30:00', 'TimeEdit', 'ลงเวลา ครั้งที่ 1'),
    field('asm_lk1', 'ศุภิสรา', 'LookupComboBox', 'ผู้บันทึก ครั้งที่ 1'),
    field('asm_chk1', 'Y', 'CheckBox', 'มีแผล Episiotomy'),
    field('asm_text1', 'กลาง', 'TextEdit', 'ชื่อแผล Episiotomy'),
    field('asm_lk6', 'แพทย์หญิงชญานิษฐ์', 'LookupComboBox', 'Attending Physician'),
  ],
};

describe('AssessmentForms', () => {
  it('shows the title of the form the config gives it', () => {
    render(<AssessmentForms assessments={[FIRST_PREGNANT]} />);

    expect(screen.getByText('แรกรับ')).toBeTruthy();
    expect(screen.getByText('Systolic')).toBeTruthy();
    expect(screen.getByText('138')).toBeTruthy();
  });

  it('takes the title from the config, not from a second map of its own', async () => {
    // A second title map in the component would shadow the config, so the
    // config is given a title of its own here: the component must follow it.
    vi.resetModules();
    vi.doMock('@/config/maternity-assessments', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/config/maternity-assessments')>();
      return {
        ...actual,
        MATERNITY_ASSESSMENT_FORMS: actual.MATERNITY_ASSESSMENT_FORMS.map((form) =>
          form.key === 'first_pregnant' ? { ...form, titleTh: 'แรกรับ (จาก config)' } : form,
        ),
      };
    });
    const { AssessmentForms: FormsFromConfig } = await import(
      '@/components/maternity/AssessmentForms'
    );

    render(<FormsFromConfig assessments={[FIRST_PREGNANT]} />);

    expect(screen.getByText('แรกรับ (จาก config)')).toBeTruthy();
    vi.doUnmock('@/config/maternity-assessments');
    vi.resetModules();
  });

  it('says so when the hospital recorded no form', () => {
    render(<AssessmentForms assessments={[]} />);

    expect(screen.getByText('ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา')).toBeTruthy();
  });

  it('renders one tab per form, in แรกรับ → ระยะคลอด → หลังคลอด order', () => {
    render(<AssessmentForms assessments={[AFTER_BIRTH, FIRST_PREGNANT]} />);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['แรกรับ', 'ระยะคลอด', 'หลังคลอด']);
  });

  it('keeps every form mounted, so a หลังคลอด record reads while แรกรับ is active', () => {
    render(<AssessmentForms assessments={[AFTER_BIRTH]} />);

    // The active tab is the first one that has records — none do for
    // แรกรับ or ระยะคลอด, so those panels say so — while the หลังคลอด
    // panel still holds its grid.
    expect(screen.getAllByText('ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา')).toHaveLength(2);
    expect(screen.getByText('ครั้งที่ 1')).toBeTruthy();
    expect(screen.getByText('08:30:00')).toBeTruthy();
    expect(screen.getByText('ศุภิสรา')).toBeTruthy();
    expect(screen.getByText('มีแผล Episiotomy')).toBeTruthy();
    // The grid header is the form's own (it also appears as the mobile cell
    // captions), and the identity strip renders the decrypted name of the
    // attending physician.
    expect(screen.getAllByText('กิจกรรมพยาบาลและการประเมินผล').length).toBeGreaterThan(1);
    expect(screen.getByText('แพทย์หญิงชญานิษฐ์')).toBeTruthy();
  });

  it('draws the แรกรับ Lab grid and the numbered risk pair', () => {
    render(<AssessmentForms assessments={[FIRST_PREGNANT]} />);

    // The Lab row label is the shared part of the site's own cell labels.
    expect(screen.getByText('Blood gr')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getByText('O')).toBeTruthy();
    expect(screen.getByText('AB')).toBeTruthy();

    // The numbered item text comes from the ไม่มี/มี pair's label.
    expect(screen.getByText('เคยชัก/มึนงง หลังคลอด')).toBeTruthy();

    // A column outside the standard layout lands in the อื่น ๆ group.
    expect(screen.getByText('อื่น ๆ ในแบบฟอร์ม')).toBeTruthy();
    expect(screen.getByText('custom note')).toBeTruthy();
  });

  it('offers the older records of one form as a picker, newest first', async () => {
    const older: MaternityAssessmentDto = {
      ...FIRST_PREGNANT,
      id: 'asm_first_pregnant_pt_nan:0',
      recordedAt: '2026-11-10T09:00:00.000Z',
    };
    render(<AssessmentForms assessments={[older, FIRST_PREGNANT]} />);

    // Two records → a badge on the tab and two date chips; the newest is
    // the one shown first.
    expect(screen.getByText('2')).toBeTruthy();
    const chips = screen.getAllByRole('button', { name: /\/69/ });
    expect(chips).toHaveLength(2);
    expect(chips[0].getAttribute('aria-pressed')).toBe('true');

    await userEvent.click(chips[1]);
    expect(chips[1].getAttribute('aria-pressed')).toBe('true');
  });
});
