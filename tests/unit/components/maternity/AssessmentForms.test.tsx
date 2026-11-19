/* @vitest-environment jsdom */
/* @vitest-environment-options { "url": "http://localhost/" } */
// AssessmentForms — the three [LR] nursing forms as a list of labelled
// fields.
//
// The title of a form comes from the config (MATERNITY_ASSESSMENT_FORMS), so
// there is ONE source of truth for it — the component keeps no second map of
// its own.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MaternityAssessmentDto } from '@/types/maternity-assessments';
import { AssessmentForms } from '@/components/maternity/AssessmentForms';

const FIRST_PREGNANT: MaternityAssessmentDto = {
  id: 'asm_first_pregnant_pt_nan:1',
  formKey: 'first_pregnant',
  formTable: 'asm_first_pregnant_pt_nan',
  formName: '[LR]-แรกรับ',
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
});
