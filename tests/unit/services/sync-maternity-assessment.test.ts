// Maternity assessment (LR) ingestion — labelling, PDPA, persistence.
//
// The rules under test:
//   1. Every stored field carries the label HOSxP's own form defines
//      (assessment_items), never a hardcoded field list.
//   2. Name-bearing columns (asm_lk*, user_login) are encrypted at rest and
//      decrypt back to the original text at the read boundary.
//   3. Rows without a primary key, an AN or a recording timestamp are
//      dropped — they cannot be linked to a patient or ordered in time.
//   4. Re-pulling the same form upserts instead of duplicating.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey, decrypt } from '@/lib/encryption';
import {
  normalizeAssessmentRows,
  syncMaternityAssessments,
  assessmentSyncCutoffDate,
  validateAssessmentPayload,
} from '@/services/sync/maternity-assessment';
import { getPatientMaternityAssessments } from '@/services/maternity-assessments';
import { MATERNITY_ASSESSMENT_FORMS } from '@/config/maternity-assessments';

const KEY = generateKey();
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? KEY;

let db: DatabaseAdapter;
const HOSPITAL_ID = 'h-asm-1';
const PATIENT_ID = 'p-asm-1';

const AFTER_BIRTH = MATERNITY_ASSESSMENT_FORMS.find((f) => f.key === 'after_birth')!;

const FORM_ROWS = [
  {
    assessment_form_id: 309,
    assessment_form_table: 'asm_lr_record_after_birth_nan',
    assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
  },
];

const ITEM_ROWS = [
  {
    assessment_form_id: 309,
    assessment_items_column: 'asm_text2',
    assessment_items_note: 'Systolic',
    assessment_component_name: 'TextEdit',
    assessment_data_type: 'VARCHAR(250)',
  },
  {
    assessment_form_id: 309,
    assessment_items_column: 'asm_chk1',
    assessment_items_note: 'ได้ให้อาหารทางปาก',
    assessment_component_name: 'CheckBox',
    assessment_data_type: 'VARCHAR(100)',
  },
  {
    assessment_form_id: 309,
    assessment_items_column: 'asm_memo3',
    assessment_items_note: 'มดลูกหดรัดตัวดี',
    assessment_component_name: 'Memo',
    assessment_data_type: 'VARCHAR(500)',
  },
  {
    assessment_form_id: 309,
    assessment_items_column: 'asm_lk6',
    assessment_items_note: 'Attending Physician',
    assessment_component_name: 'LookupComboBox',
    assessment_data_type: 'VARCHAR(100)',
  },
];

function rawRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    asm_lr_record_after_birth_nan_id: 2418,
    an: 'AN-ASM-1',
    vn: 'VN-ASM-1',
    vnan: 'VN-ASM-1AN-ASM-1',
    patient_type: 'IPD',
    assessment_head_id: 1403829,
    user_login: 'นางจิรนันท์ แก้วอินแสง',
    asm_date1: '2026-11-17',
    asm_time1: '19:15:00',
    asm_text2: '138',
    asm_chk1: 'Y',
    asm_memo3: 'มดลูกหดรัดตัวดี',
    asm_lk6: 'พญ.ศุภิสรา ชลยุทธ',
    head_datetime: '2026-11-17T21:03:15',
    head_staff: 'jcome',
    head_form_id: 309,
    patient_hn: '000285565',
    ...over,
  };
}

beforeEach(async () => {
  db = await createTestDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [HOSPITAL_ID, '10716', 'Test', 'M2', now, now],
  );
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date,
        labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, ?, 'ACTIVE', ?, ?, ?)`,
    [PATIENT_ID, HOSPITAL_ID, '000285565', 'AN-ASM-1', '2026-11-17T14:21:00', now, now, now],
  );
});

describe('normalizeAssessmentRows', () => {
  const items = new Map(ITEM_ROWS.map((i) => [i.assessment_items_column, i]));

  it('labels every field from the form metadata', () => {
    const { rows } = normalizeAssessmentRows(AFTER_BIRTH, [rawRow()], items, 'ชื่อแบบฟอร์ม', {
      encryptionKey: KEY,
    });
    expect(rows).toHaveLength(1);
    const labels = rows[0].fields.map((f) => f.label);
    expect(labels).toContain('Systolic');
    expect(labels).toContain('ได้ให้อาหารทางปาก');
    expect(labels).toContain('มดลูกหดรัดตัวดี');
    expect(rows[0].fields.find((f) => f.label === 'Systolic')?.value).toBe('138');
    expect(rows[0].fields.find((f) => f.label === 'ได้ให้อาหารทางปาก')?.component).toBe('CheckBox');
  });

  it('encrypts name-bearing values and marks them', () => {
    const { rows } = normalizeAssessmentRows(AFTER_BIRTH, [rawRow()], items, null, {
      encryptionKey: KEY,
    });
    const doctor = rows[0].fields.find((f) => f.column === 'asm_lk6');
    expect(doctor?.encrypted).toBe(true);
    expect(doctor?.value).not.toContain('ศุภิสรา');
    expect(decrypt(doctor!.value, KEY)).toBe('พญ.ศุภิสรา ชลยุทธ');

    const login = rows[0].fields.find((f) => f.column === 'user_login');
    expect(login?.encrypted).toBe(true);
  });

  it('drops the name when no encryption key is configured (fail closed)', () => {
    const { rows } = normalizeAssessmentRows(AFTER_BIRTH, [rawRow()], items, null, {
      encryptionKey: null,
    });
    expect(rows[0].fields.find((f) => f.column === 'asm_lk6')).toBeUndefined();
    expect(rows[0].fields.find((f) => f.column === 'user_login')).toBeUndefined();
  });

  it('drops rows without a pk, an AN or a timestamp', () => {
    const { rows, skipped } = normalizeAssessmentRows(
      AFTER_BIRTH,
      [
        rawRow({ asm_lr_record_after_birth_nan_id: null }),
        rawRow({ an: null }),
        rawRow({ head_datetime: null }),
        rawRow(),
      ],
      items,
      null,
      { encryptionKey: KEY },
    );
    expect(rows).toHaveLength(1);
    expect(skipped).toBe(3);
  });

  it('records the form date and the head staff', () => {
    const { rows } = normalizeAssessmentRows(AFTER_BIRTH, [rawRow()], items, null, {
      encryptionKey: KEY,
    });
    expect(rows[0].recordedDate).toBe('2026-11-17');
    expect(rows[0].entryStaff).toBe('jcome');
    expect(rows[0].sourcePk).toBe('asm_lr_record_after_birth_nan:2418');
  });
});

describe('syncMaternityAssessments', () => {
  it('stores the labelled form and links it to the patient', async () => {
    const r = await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    });
    expect(r.upserted).toBe(1);

    const stored = await db.query<{ patient_id: string; form_name: string; fields_json: string }>(
      'SELECT patient_id, form_name, fields_json FROM cached_maternity_assessments',
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].patient_id).toBe(PATIENT_ID);
    expect(stored[0].form_name).toContain('หลังคลอด');
    expect(JSON.stringify(stored[0].fields_json)).toContain('Systolic');
  });

  it('upserts instead of duplicating on a re-pull', async () => {
    const payload = {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    };
    await syncMaternityAssessments(db, HOSPITAL_ID, payload);
    await syncMaternityAssessments(db, HOSPITAL_ID, {
      ...payload,
      records: { asm_lr_record_after_birth_nan: [rawRow({ asm_text2: '150' })] },
    });
    const stored = await db.query<{ fields_json: string }>(
      'SELECT fields_json FROM cached_maternity_assessments',
    );
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored[0].fields_json)).toContain('150');
  });

  it('keeps a form whose patient is not cached', async () => {
    const r = await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow({ an: 'AN-UNKNOWN' })] },
    });
    expect(r.upserted).toBe(1);
    const stored = await db.query<{ patient_id: string | null }>(
      'SELECT patient_id FROM cached_maternity_assessments',
    );
    expect(stored[0].patient_id).toBeNull();
  });
});

describe('read back', () => {
  it('decrypts the names and returns the DTO', async () => {
    await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    });
    const dtos = await getPatientMaternityAssessments(db, 'AN-ASM-1', HOSPITAL_ID);
    expect(dtos).toHaveLength(1);
    expect(dtos[0].formKey).toBe('after_birth');
    expect(dtos[0].fields.find((f) => f.column === 'asm_lk6')?.value).toBe('พญ.ศุภิสรา ชลยุทธ');
    expect(dtos[0].fields.find((f) => f.column === 'asm_lk6')?.encrypted).toBe(false);
  });
});

describe('assessmentSyncCutoffDate', () => {
  it('backfills a year when the hospital has no cached form', async () => {
    const cutoff = await assessmentSyncCutoffDate(
      db,
      HOSPITAL_ID,
      new Date('2026-11-18T00:00:00Z'),
    );
    expect(cutoff).toBe('2025-11-18');
  });

  it('re-reads a small overlap after the first sync', async () => {
    await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    });
    const cutoff = await assessmentSyncCutoffDate(
      db,
      HOSPITAL_ID,
      new Date('2026-11-18T00:00:00Z'),
    );
    expect(cutoff).toBe('2026-11-15');
  });
});

describe('validateAssessmentPayload', () => {
  it('accepts a well-formed payload', () => {
    const v = validateAssessmentPayload({
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    });
    expect(v.valid).toBe(true);
    expect(v.payload?.records.asm_lr_record_after_birth_nan).toHaveLength(1);
  });

  it('rejects an unknown table', () => {
    const v = validateAssessmentPayload({
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { some_other_table: [rawRow()] },
    });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('unknown assessment table');
  });

  it('rejects a malformed item row', () => {
    const v = validateAssessmentPayload({
      forms: FORM_ROWS,
      items: [{ assessment_form_id: 309, assessment_items_column: 'asm_text2); DROP TABLE x--' }],
      records: {},
    });
    expect(v.valid).toBe(false);
  });

  it('rejects a payload that is not an object', () => {
    expect(validateAssessmentPayload('nope').valid).toBe(false);
    expect(validateAssessmentPayload(null).valid).toBe(false);
  });
});
