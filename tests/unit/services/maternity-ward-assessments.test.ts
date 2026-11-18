// getPatientAssessments — the hospital console reads the [LR] forms of one
// admission straight from HOSxP. The forms are positional there, so the
// service must pull the metadata too and label every column.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPatientAssessments } from '@/services/maternity-ward';
import type { ConnectionConfig } from '@/types/bms-browser';

const mockFetch = vi.fn();
global.fetch = mockFetch;

const cfg: ConnectionConfig = {
  apiUrl: 'https://t.example/api',
  bearerToken: 'BEARER',
  appIdentifier: 'NN-LRMS.Web',
};

function sqlResponse(data: unknown[]) {
  return {
    ok: true,
    status: 200,
    clone() {
      return this;
    },
    json: async () => ({ data, MessageCode: 200, Message: 'ok' }),
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('getPatientAssessments', () => {
  it('labels the rows with the form metadata and skips rows without a timestamp', async () => {
    mockFetch
      // 1. assessment_form
      .mockResolvedValueOnce(
        sqlResponse([
          {
            assessment_form_id: 308,
            assessment_form_table: 'asm_lr_record_birth_period_nan',
            assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลในระยะคลอด',
          },
        ]),
      )
      // 2. assessment_items
      .mockResolvedValueOnce(
        sqlResponse([
          {
            assessment_form_id: 308,
            assessment_items_column: 'asm_text12',
            assessment_items_note: 'BP',
            assessment_component_name: 'TextEdit',
            assessment_data_type: 'VARCHAR(250)',
          },
          {
            assessment_form_id: 308,
            assessment_items_column: 'asm_chk2',
            assessment_items_note: 'ระยะที่ 2 คำเนินไปตามปกติ',
            assessment_component_name: 'CheckBox',
            assessment_data_type: 'VARCHAR(100)',
          },
        ]),
      )
      // 3. rows of the three tables, in form order: แรกรับ / ระยะคลอด / หลังคลอด
      .mockResolvedValueOnce(sqlResponse([]))
      .mockResolvedValueOnce(
        sqlResponse([
          {
            asm_lr_record_birth_period_nan_id: 1765,
            an: 'AN1',
            asm_date1: '2026-11-17',
            asm_text12: '140',
            asm_chk2: 'Y',
            head_datetime: '2026-11-17T20:57:30',
            head_staff: 'jcome',
            patient_hn: '000285565',
          },
        ]),
      )
      .mockResolvedValueOnce(sqlResponse([]));

    const dtos = await getPatientAssessments(cfg, 'AN1');
    expect(dtos).toHaveLength(1);
    expect(dtos[0].formKey).toBe('birth_period');
    expect(dtos[0].formName).toContain('ระยะคลอด');
    expect(dtos[0].recordedDate).toBe('2026-11-17');
    expect(dtos[0].entryStaff).toBe('jcome');
    expect(dtos[0].fields.map((f) => f.label)).toContain('BP');
    expect(dtos[0].fields.find((f) => f.label === 'BP')?.value).toBe('140');

    // The row query is bound by AN — never interpolated.
    const rowCall = JSON.parse(mockFetch.mock.calls[3][1].body);
    expect(rowCall.sql).toContain('asm_lr_record_birth_period_nan');
    expect(rowCall.sql).toContain('WHERE t.an = :an');
    expect(rowCall.params).toEqual({
      an: { value: 'AN1', value_type: 'string' },
    });
  });

  it('drops a row that has no recording timestamp', async () => {
    mockFetch
      .mockResolvedValueOnce(
        sqlResponse([
          {
            assessment_form_id: 308,
            assessment_form_table: 'asm_lr_record_birth_period_nan',
            assessment_form_name: 'x',
          },
        ]),
      )
      .mockResolvedValueOnce(sqlResponse([]))
      .mockResolvedValueOnce(
        sqlResponse([
          {
            asm_lr_record_birth_period_nan_id: 1765,
            an: 'AN1',
            head_datetime: null,
          },
        ]),
      )
      .mockResolvedValueOnce(sqlResponse([]))
      .mockResolvedValueOnce(sqlResponse([]));

    const dtos = await getPatientAssessments(cfg, 'AN1');
    expect(dtos).toHaveLength(0);
  });

  it('keeps the forms a site does use when another form table is missing', async () => {
    mockFetch
      .mockResolvedValueOnce(
        sqlResponse([
          {
            assessment_form_id: 308,
            assessment_form_table: 'asm_lr_record_birth_period_nan',
            assessment_form_name: 'x',
          },
        ]),
      )
      .mockResolvedValueOnce(sqlResponse([]))
      // first_pregnant: the site does not have this table at all.
      .mockRejectedValueOnce(new Error('relation "asm_first_pregnant_pt_nan" does not exist'))
      .mockResolvedValueOnce(
        sqlResponse([
          {
            asm_lr_record_birth_period_nan_id: 1765,
            an: 'AN1',
            asm_date1: '2026-11-17',
            asm_text12: '140',
            head_datetime: '2026-11-17T20:57:30',
            head_staff: 'jcome',
          },
        ]),
      )
      .mockRejectedValueOnce(new Error('relation "asm_lr_record_after_birth_nan" does not exist'));

    const dtos = await getPatientAssessments(cfg, 'AN1');
    expect(dtos).toHaveLength(1);
    expect(dtos[0].formKey).toBe('birth_period');
  });
});
