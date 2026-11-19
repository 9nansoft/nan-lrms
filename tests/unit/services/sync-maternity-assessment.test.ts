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
//   5. NO ROW IS LOST: each form has its own cursor (the last pk pulled),
//      the cursor follows the PULL and never moves backwards, and a dense
//      form (hundreds of rows on one day) still advances.
//   6. ONE BAD ROW CANNOT BLOCK THE REST: unusable values are dropped and a
//      row the database refuses is isolated from the rows around it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey, decrypt, encrypt } from '@/lib/encryption';
import { BmsSessionClient, BmsApiErrorClass } from '@/lib/bms-session';
import {
  normalizeAssessmentRows,
  syncMaternityAssessments,
  advanceAssessmentCursors,
  readAssessmentCursors,
  resolveCursorAdvance,
  pullMaternityAssessmentsFromHosxp,
  pruneReconciledAssessments,
} from '@/services/sync/maternity-assessment';
import {
  getPatientMaternityAssessments,
  MAX_CACHED_ASSESSMENTS_PER_ADMISSION,
} from '@/services/maternity-assessments';
import {
  writeAssessmentMetadataCache,
  UNUSED_FORM_ID,
} from '@/services/assessment-metadata-cache';
import { logger } from '@/lib/logger';
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

  it('writes nothing when the hospital data was purged', async () => {
    // The admin wiped this hospital's data: every sync path is suspended
    // until it is re-onboarded, so the forms must not come back.
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospital_bms_config
         (id, hospital_id, tunnel_url, data_purged_at, created_at, updated_at)
       VALUES ('hbc-purged-asm', ?, 'https://tunnel.test', ?, ?, ?)`,
      [HOSPITAL_ID, '2026-11-01T00:00:00.000Z', now, now],
    );

    const r = await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: [rawRow()] },
    });

    expect(r.purged).toBe(true);
    expect(r.upserted).toBe(0);
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });
});

describe('read back', () => {
  /** `count` cached forms of one admission, oldest first (one minute apart). */
  async function insertCachedForms(
    count: number,
    options: { an?: string; hospitalId?: string; idPrefix?: string } = {},
  ): Promise<void> {
    const an = options.an ?? 'AN-ASM-1';
    const hospitalId = options.hospitalId ?? HOSPITAL_ID;
    const prefix = options.idPrefix ?? 'cma';
    await db.execute(
      `INSERT INTO cached_maternity_assessments
         (id, hospital_id, an, source_system, source_pk, form_key, form_table,
          recorded_at, fields_json, synced_at, created_at, updated_at)
       SELECT ? || '-' || lpad(g.n::text, 4, '0'), ?, ?, 'HOSXP',
              ? || '-src-' || g.n::text, 'after_birth',
              'asm_lr_record_after_birth_nan',
              ?::timestamptz + make_interval(mins => g.n),
              '[]'::jsonb, now(), now(), now()
         FROM generate_series(1, ?) AS g(n)`,
      [prefix, hospitalId, an, prefix, '2026-01-01T00:00:00.000Z', count],
    );
  }

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

  it('caps the read and keeps the newest forms', async () => {
    // An admission with a long stay accumulates a form per nursing shift.
    // The reader only shows the newest ones, so the read is bounded — and
    // the bound must not throw away the NEWEST rows.
    const total = MAX_CACHED_ASSESSMENTS_PER_ADMISSION + 5;
    await insertCachedForms(total);

    const dtos = await getPatientMaternityAssessments(db, 'AN-ASM-1', HOSPITAL_ID);

    expect(dtos).toHaveLength(MAX_CACHED_ASSESSMENTS_PER_ADMISSION);
    expect(dtos[0].id).toBe('cma-0205');
    expect(dtos[dtos.length - 1].id).toBe('cma-0006');
    // The oldest rows are the ones dropped.
    expect(dtos.map((d) => d.id)).not.toContain('cma-0005');
  });

  it('reads nothing of another admission or another hospital', async () => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, created_at, updated_at)
         VALUES ('h-asm-other', '10799', 'Other', 'M2', ?, ?)`,
      [now, now],
    );
    await insertCachedForms(3);
    await insertCachedForms(3, { an: 'AN-OTHER', idPrefix: 'cma-an' });
    await insertCachedForms(3, { hospitalId: 'h-asm-other', idPrefix: 'cma-h' });

    const dtos = await getPatientMaternityAssessments(db, 'AN-ASM-1', HOSPITAL_ID);

    expect(dtos).toHaveLength(3);
    expect(dtos.every((d) => d.id.startsWith('cma-'))).toBe(true);
  });
});

describe('cursors', () => {
  it('starts empty for a hospital that never synced', async () => {
    expect(await readAssessmentCursors(db, HOSPITAL_ID)).toEqual({});
  });

  it('advances to the position the server resolved and never moves backwards', async () => {
    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '2418',
    });
    expect(await readAssessmentCursors(db, HOSPITAL_ID)).toEqual({
      asm_lr_record_after_birth_nan: '2418',
    });

    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '2000',
    });
    expect((await readAssessmentCursors(db, HOSPITAL_ID)).asm_lr_record_after_birth_nan).toBe(
      '2418',
    );

    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '2500',
    });
    expect((await readAssessmentCursors(db, HOSPITAL_ID)).asm_lr_record_after_birth_nan).toBe(
      '2500',
    );
  });

  it('keeps one cursor per form — a busy form cannot skip a quiet one', async () => {
    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '2418',
    });
    const cursors = await readAssessmentCursors(db, HOSPITAL_ID);
    expect(cursors.asm_lr_record_after_birth_nan).toBe('2418');
    // The form the hospital barely uses has NOT moved.
    expect(cursors.asm_first_pregnant_pt_nan).toBeUndefined();
  });

  it('ignores a cursor for a table the app does not know', async () => {
    await advanceAssessmentCursors(db, HOSPITAL_ID, { some_other_table: '5' });
    expect(await readAssessmentCursors(db, HOSPITAL_ID)).toEqual({});
  });

  it('moves past the keys that were delivered, in order', () => {
    const next = resolveCursorAdvance(
      {
        authoritative: ['2418', '2419', '2420'],
        delivered: ['2418', '2419', '2420'],
        persisted: ['2418', '2419', '2420'],
        unusable: [],
        failed: [],
      },
      '0',
    );
    expect(next).toBe('2420');
  });

  it('does NOT move past a key the browser skipped', () => {
    // The browser claims the last key but omits a valid lower one — the
    // cursor must not pass the omitted key, or that row is lost for good.
    const next = resolveCursorAdvance(
      {
        authoritative: ['2418', '2419', '2420'],
        delivered: ['2418', '2420'],
        persisted: ['2418', '2420'],
        unusable: [],
        failed: [],
      },
      '0',
    );
    expect(next).toBe('2418');
  });

  it('does NOT move past a key the database refused', () => {
    // The row is re-pulled next cycle instead of being skipped.
    const next = resolveCursorAdvance(
      {
        authoritative: ['2418', '2419', '2420'],
        delivered: ['2418', '2419', '2420'],
        persisted: ['2418', '2420'],
        unusable: [],
        failed: ['2419'],
      },
      '0',
    );
    expect(next).toBe('2418');
  });

  it('moves past a key the SERVER judged un-storable', () => {
    // A malformed row is delivered and dropped for good — holding the form
    // back for it would lose every row behind it. The verdict is the
    // server's own (read from HOSxP), not the browser's.
    const next = resolveCursorAdvance(
      {
        authoritative: ['2418', '2419', '2420'],
        delivered: ['2418', '2419', '2420'],
        persisted: ['2418', '2420'],
        unusable: ['2419'],
        failed: [],
      },
      '0',
    );
    expect(next).toBe('2420');
  });

  it('does not move when nothing was delivered', () => {
    const next = resolveCursorAdvance(
      { authoritative: ['2418'], delivered: [], persisted: [], unusable: [], failed: [] },
      '0',
    );
    expect(next).toBeNull();
  });

  it('a dense form keeps advancing — the cursor, not a date, drives the pull', async () => {
    // 600 rows recorded on the same day: a date-based window would re-read
    // the same oldest page forever and the newest 100 rows would never land.
    const rows = Array.from({ length: 600 }, (_, i) =>
      rawRow({ asm_lr_record_after_birth_nan_id: 1000 + i }),
    );
    const firstPage = rows.slice(0, 500);
    const secondPage = rows.slice(500);

    await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: firstPage },
    });
    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '1499',
    });
    expect((await readAssessmentCursors(db, HOSPITAL_ID)).asm_lr_record_after_birth_nan).toBe(
      '1499',
    );

    await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: { asm_lr_record_after_birth_nan: secondPage },
    });
    await advanceAssessmentCursors(db, HOSPITAL_ID, {
      asm_lr_record_after_birth_nan: '1599',
    });
    expect((await readAssessmentCursors(db, HOSPITAL_ID)).asm_lr_record_after_birth_nan).toBe(
      '1599',
    );
  });
});

describe('bad rows', () => {
  it('drops a row HOSxP filled with a zero date', async () => {
    const r = await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: {
        asm_lr_record_after_birth_nan: [rawRow({ head_datetime: '0000-00-00 00:00:00' })],
      },
    });
    expect(r.upserted).toBe(0);
    expect(r.skipped).toBe(1);
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });

  it('drops a row whose AN cannot be linked', async () => {
    const r = await syncMaternityAssessments(db, HOSPITAL_ID, {
      forms: FORM_ROWS,
      items: ITEM_ROWS,
      records: {
        asm_lr_record_after_birth_nan: [rawRow({ an: 'X'.repeat(64) })],
      },
    });
    expect(r.upserted).toBe(0);
    expect(r.skipped).toBe(1);
  });

  it('keeps the other rows when one row the database refuses lands', async () => {
    // A patient_id that does not exist violates the foreign key — the row
    // must be isolated, not roll the batch back.
    const { upsertMaternityAssessments } = await import('@/services/sync/maternity-assessment');
    const good = {
      hospitalId: HOSPITAL_ID,
      patientId: PATIENT_ID,
      an: 'AN-ASM-1',
      hn: '000285565',
      sourceSystem: 'HOSXP' as const,
      sourcePk: 'asm_lr_record_after_birth_nan:2418',
      formKey: 'after_birth' as const,
      formTable: 'asm_lr_record_after_birth_nan',
      formName: 'x',
      recordedAt: '2026-11-17T21:03:15',
      recordedDate: '2026-11-17',
      entryStaff: 'jcome',
      fields: [],
    };
    const bad = { ...good, sourcePk: 'asm_lr_record_after_birth_nan:2419', patientId: 'nope' };

    const r = await upsertMaternityAssessments(db, HOSPITAL_ID, [good, bad]);
    expect(r.upserted).toBe(1);
    expect(r.failed).toBe(1);
    const stored = await db.query('SELECT source_pk FROM cached_maternity_assessments');
    expect(stored).toHaveLength(1);
    expect(stored[0].source_pk).toBe('asm_lr_record_after_birth_nan:2418');
  });
});

describe('pullMaternityAssessmentsFromHosxp', () => {
  const TUNNEL = 'http://tunnel.test';

  async function seedBmsConfig(options: { jwt?: string | null; expiresAt?: string | null; marketplaceToken?: string | null } = {}) {
    const now = new Date().toISOString();
    await db.execute('DELETE FROM hospital_bms_config WHERE hospital_id = ?', [HOSPITAL_ID]);
    await db.execute(
      `INSERT INTO hospital_bms_config
         (id, hospital_id, tunnel_url, session_jwt, session_expires_at, marketplace_token, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'hbc-asm-1',
        HOSPITAL_ID,
        TUNNEL,
        options.jwt === undefined ? 'jwt-old' : options.jwt,
        options.expiresAt === undefined
          ? new Date(Date.now() + 3600_000).toISOString()
          : options.expiresAt,
        options.marketplaceToken ? encrypt(options.marketplaceToken, KEY) : null,
        now,
        now,
      ],
    );
  }

  /** The three form queries answer with the same mock HOSxP does. */
  function mockHosxp(
    options: {
      failTables?: string[];
      failMetadata?: boolean;
      /** HOSxP answers with no form at all (nothing was learned). */
      emptyMetadata?: boolean;
      forms?: Record<string, unknown>[];
      items?: Record<string, unknown>[];
      rows?: Record<string, unknown>[];
    } = {},
  ) {
    return vi.spyOn(BmsSessionClient.prototype, 'executeQuery').mockImplementation(
      async (sql: string) => {
        const wrap = (data: Record<string, unknown>[]) => ({
          data,
          field: [],
          field_name: [],
          record_count: data.length,
        });
        for (const table of options.failTables ?? []) {
          if (sql.includes(`FROM ${table}`)) throw new Error(`query failed: ${table}`);
        }
        if (sql.includes('FROM assessment_form')) {
          if (options.failMetadata) throw new Error('metadata query failed');
          if (options.emptyMetadata) return wrap([]);
          return wrap(
            options.forms ?? [
              {
                assessment_form_id: 309,
                assessment_form_table: 'asm_lr_record_after_birth_nan',
                assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
              },
            ],
          );
        }
        if (sql.includes('FROM assessment_items')) return wrap(options.items ?? []);
        if (sql.includes('FROM asm_lr_record_after_birth_nan')) {
          return wrap(options.rows ?? [rawRow()]);
        }
        return wrap([]);
      },
    );
  }

  /**
   * The metadata queries of a pull — the reads of `assessment_form` and
   * `assessment_items`. The record query carries `assessment_form_id` in its
   * SELECT list, so the table name has to be matched, not the substring.
   */
  function metadataQueries(spy: ReturnType<typeof mockHosxp>): string[] {
    return spy.mock.calls
      .map((call) => String(call[0]))
      .filter((sql) => /FROM\s+assessment_(form|items)\b/.test(sql));
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the form whose HOSxP query failed instead of reporting an empty pull', async () => {
    await seedBmsConfig();
    mockHosxp({ failTables: ['asm_first_pregnant_pt_nan'] });

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

    expect(r.failedForms).toContain('asm_first_pregnant_pt_nan');
    expect(r.error).toContain('asm_first_pregnant_pt_nan');
    // The form that DID answer still landed.
    expect(r.upserted).toBe(1);
  });

  it('does not report a form the site does not use as a failure', async () => {
    await seedBmsConfig();
    const spy = mockHosxp();
    spy.mockImplementation(async (sql: string) => {
      if (sql.includes('asm_first_pregnant_pt_nan')) {
        throw new BmsApiErrorClass({
          code: 'SQL_ERROR',
          message:
            'SQL query failed: Conflict — Database error: relation "asm_first_pregnant_pt_nan" does not exist',
          statusCode: 409,
        });
      }
      return { data: [], field: [], field_name: [], record_count: 0 };
    });

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

    // A site without the form is not a broken pull.
    expect(r.failedForms).not.toContain('asm_first_pregnant_pt_nan');
    expect(r.error).toBeNull();
  });

  it('reports the reason when the hospital has no HOSxP session at all', async () => {
    await seedBmsConfig({ jwt: null, expiresAt: null });
    vi.spyOn(BmsSessionClient.prototype, 'getSessionId').mockRejectedValue(new Error('denied'));

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

    expect(r.upserted).toBe(0);
    expect(r.error).toMatch(/no HOSxP session/);
  });

  it('writes nothing for a hospital whose data was purged', async () => {
    // The scheduler skips a purged hospital — but the guard that matters is
    // at the write: a pull that was already running when the admin purged
    // must not put the data back.
    await seedBmsConfig();
    await db.execute(
      'UPDATE hospital_bms_config SET data_purged_at = ? WHERE hospital_id = ?',
      ['2026-11-01T00:00:00.000Z', HOSPITAL_ID],
    );
    const spy = mockHosxp();

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

    expect(r.purged).toBe(true);
    expect(r.upserted).toBe(0);
    expect(r.error).toMatch(/purged/);
    // HOSxP was never even asked.
    expect(spy).not.toHaveBeenCalled();
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });

  it('sends the marketplace token with every query (HOSxP randomises HN without it)', async () => {
    await seedBmsConfig({ marketplaceToken: 'MKT-TOKEN' });
    const spy = mockHosxp();

    await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

    expect(spy).toHaveBeenCalled();
    for (const call of spy.mock.calls) {
      expect(call[4]).toMatchObject({ marketplaceToken: 'MKT-TOKEN' });
    }
  });

  it('exchanges the session id the browser pushed for a bearer token', async () => {
    await seedBmsConfig({ jwt: null, expiresAt: null });
    vi.spyOn(BmsSessionClient.prototype, 'getSessionId').mockRejectedValue(
      new Error('Access Denied'),
    );
    const validate = vi
      .spyOn(BmsSessionClient.prototype, 'validateSession')
      .mockResolvedValue({
        sessionId: 'SID-1',
        jwt: 'jwt-fresh',
        bmsUrl: TUNNEL,
        userInfo: {
          name: 'Test',
          position: 'nurse',
          hospital_code: '10716',
          department: 'OB',
          is_hr_admin: false,
          is_director: false,
        },
        expiresAt: new Date(Date.now() + 3600_000),
        expiredSecond: 3600,
      });
    mockHosxp();

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, {
      bmsSessionId: 'SID-1',
    });

    expect(validate).toHaveBeenCalledWith('SID-1', expect.any(String));
    expect(r.upserted).toBe(1);
    // The fresh token is stored, so the next cycle starts from it.
    const stored = await db.query<{ session_jwt: string }>(
      'SELECT session_jwt FROM hospital_bms_config WHERE hospital_id = ?',
      [HOSPITAL_ID],
    );
    expect(stored[0].session_jwt).toBe('jwt-fresh');
  });

  it('refuses a pushed session that points at another hospital tunnel', async () => {
    await seedBmsConfig({ jwt: null, expiresAt: null });
    vi.spyOn(BmsSessionClient.prototype, 'getSessionId').mockRejectedValue(
      new Error('Access Denied'),
    );
    vi.spyOn(BmsSessionClient.prototype, 'validateSession').mockResolvedValue({
      sessionId: 'SID-OTHER',
      jwt: 'jwt-other',
      // Another site's tunnel — the hospital code happens to match, the
      // tunnel does not.
      bmsUrl: 'https://99999-other.tunnel.hosxp.net',
      userInfo: {
        name: 'Other',
        position: 'nurse',
        hospital_code: '10716',
        department: 'OB',
        is_hr_admin: false,
        is_director: false,
      },
      expiresAt: new Date(Date.now() + 3600_000),
      expiredSecond: 3600,
    });
    mockHosxp();

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, {
      bmsSessionId: 'SID-OTHER',
    });

    expect(r.upserted).toBe(0);
    expect(r.error).toMatch(/no HOSxP session/);
  });

  it('refuses a pushed session that belongs to another hospital', async () => {
    await seedBmsConfig({ jwt: null, expiresAt: null });
    vi.spyOn(BmsSessionClient.prototype, 'getSessionId').mockRejectedValue(
      new Error('Access Denied'),
    );
    vi.spyOn(BmsSessionClient.prototype, 'validateSession').mockResolvedValue({
      sessionId: 'SID-OTHER',
      jwt: 'jwt-other',
      bmsUrl: TUNNEL,
      userInfo: {
        name: 'Other',
        position: 'nurse',
        hospital_code: '99999',
        department: 'OB',
        is_hr_admin: false,
        is_director: false,
      },
      expiresAt: new Date(Date.now() + 3600_000),
      expiredSecond: 3600,
    });
    mockHosxp();

    const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, {
      bmsSessionId: 'SID-OTHER',
    });

    expect(r.upserted).toBe(0);
    expect(r.error).toMatch(/no HOSxP session/);
  });

  // ─── The reconciliation pass ──────────────────────────────────────────────
  //
  // The cursor pull only ever sees the keys ABOVE the cursor. A row HOSxP
  // deleted — or one inserted with a key below the cursor — is therefore
  // never read again and stays in the cache for ever. The reconciliation pass
  // re-reads the recent window whatever the key is, and drops the cached rows
  // the window no longer holds.
  describe('reconciliation', () => {
    const TABLE = 'asm_lr_record_after_birth_nan';

    /** The plain timestamp of a moment, the way HOSxP writes it down. */
    function stamp(offsetMs: number): string {
      return new Date(Date.now() + offsetMs).toISOString().slice(0, 19).replace('T', ' ');
    }
    /** The same stamp with the separator HOSxP uses in a datetime column. */
    function headStamp(offsetMs: number): string {
      return new Date(Date.now() + offsetMs).toISOString().slice(0, 19);
    }

    const INSIDE_WINDOW = -24 * 60 * 60 * 1000; // yesterday
    const OUTSIDE_WINDOW = -30 * 24 * 60 * 60 * 1000; // a month ago

    /** A cached row of the after-birth form. */
    async function insertCached(pk: string, recordedAt: string): Promise<void> {
      await db.execute(
        `INSERT INTO cached_maternity_assessments
           (id, hospital_id, an, source_system, source_pk, form_key, form_table,
            recorded_at, fields_json, synced_at, created_at, updated_at)
         VALUES (?, ?, 'AN-ASM-1', 'HOSXP', ?, 'after_birth', ?, ?::timestamptz,
                 '[]'::jsonb, now(), now(), now())`,
        [`cma-${pk}`, HOSPITAL_ID, `${TABLE}:${pk}`, TABLE, recordedAt],
      );
    }

    /** The keys of the cached rows of the after-birth form. */
    async function cachedPks(): Promise<string[]> {
      const rows = await db.query<{ source_pk: string }>(
        `SELECT source_pk FROM cached_maternity_assessments
          WHERE hospital_id = ? AND form_table = ? ORDER BY source_pk`,
        [HOSPITAL_ID, TABLE],
      );
      return rows.map((row) => row.source_pk.slice(row.source_pk.indexOf(':') + 1));
    }

    /** The mock that answers the cursor query and the window query apart. */
    function mockWindowed(
      options: {
        cursorRows?: Record<string, unknown>[];
        windowRows?: Record<string, unknown>[];
        failWindow?: boolean;
      } = {},
    ) {
      return vi.spyOn(BmsSessionClient.prototype, 'executeQuery').mockImplementation(
        async (sql: string) => {
          const wrap = (data: Record<string, unknown>[]) => ({
            data,
            field: [],
            field_name: [],
            record_count: data.length,
          });
          if (sql.includes('FROM assessment_form')) {
            return wrap([
              {
                assessment_form_id: 309,
                assessment_form_table: TABLE,
                assessment_form_name: '[LR]-แบบฟอร์มหลังคลอด',
              },
            ]);
          }
          if (sql.includes('FROM assessment_items')) return wrap([]);
          if (sql.includes(`FROM ${TABLE}`)) {
            if (sql.includes('assessment_head_datetime >=')) {
              if (options.failWindow) throw new Error('window query failed');
              return wrap(options.windowRows ?? []);
            }
            return wrap(options.cursorRows ?? []);
          }
          return wrap([]);
        },
      );
    }

    /** The window queries of a pull. */
    function windowQueries(spy: ReturnType<typeof mockWindowed>): string[] {
      return spy.mock.calls
        .map((call) => String(call[0]))
        .filter((sql) => sql.includes('assessment_head_datetime >='));
    }

    it('does not read the window unless the pass is asked for', async () => {
      await seedBmsConfig();
      const spy = mockWindowed();

      await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID);

      expect(windowQueries(spy)).toHaveLength(0);
    });

    it('drops the cached rows the window no longer holds', async () => {
      await seedBmsConfig();
      await insertCached('7', stamp(INSIDE_WINDOW));
      await insertCached('9', stamp(INSIDE_WINDOW));
      await insertCached('3', stamp(OUTSIDE_WINDOW));
      // HOSxP still has the row 7 — the row 9 is gone.
      mockWindowed({
        windowRows: [rawRow({ asm_lr_record_after_birth_nan_id: 7, head_datetime: headStamp(INSIDE_WINDOW) })],
      });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { reconcile: true });

      expect(r.deleted).toBe(1);
      const pks = await cachedPks();
      expect(pks).toContain('7');
      expect(pks).not.toContain('9');
      // A row from before the window is not the window's business.
      expect(pks).toContain('3');
    });

    it('stores a row the cursor pull would never see again', async () => {
      // The cursor is already past this row's key: only the window read can
      // bring it back.
      await seedBmsConfig();
      await advanceAssessmentCursors(db, HOSPITAL_ID, { [TABLE]: '9999' });
      mockWindowed({
        windowRows: [rawRow({ asm_lr_record_after_birth_nan_id: 7, head_datetime: headStamp(INSIDE_WINDOW) })],
      });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { reconcile: true });

      expect(r.upserted).toBe(1);
      expect(await cachedPks()).toContain('7');
    });

    it('stores a row the cursor pull and the window read both saw once', async () => {
      await seedBmsConfig();
      const row = rawRow({
        asm_lr_record_after_birth_nan_id: 7,
        head_datetime: headStamp(INSIDE_WINDOW),
      });
      mockWindowed({ cursorRows: [row], windowRows: [row] });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { reconcile: true });

      expect(r.upserted).toBe(1);
      expect((await cachedPks()).filter((pk) => pk === '7')).toHaveLength(1);
    });

    it('keeps every cached row when the window read failed', async () => {
      await seedBmsConfig();
      await insertCached('9', stamp(INSIDE_WINDOW));
      mockWindowed({ failWindow: true });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { reconcile: true });

      // A read that failed does not know what is missing — nothing is dropped.
      expect(r.deleted).toBe(0);
      expect(r.reconcileError).toContain(TABLE);
      expect(await cachedPks()).toContain('9');
    });

    it('prunes nothing when the window read did not see the whole window', async () => {
      // The read hit the row limit: it knows what it saw, not what it did
      // not see. Guessing would delete live forms.
      await seedBmsConfig();
      await insertCached('9', stamp(INSIDE_WINDOW));

      const pruned = await pruneReconciledAssessments(
        db,
        HOSPITAL_ID,
        { [TABLE]: [rawRow({ asm_lr_record_after_birth_nan_id: 7, head_datetime: headStamp(INSIDE_WINDOW) })] },
        { [TABLE]: false },
        stamp(-7 * 24 * 60 * 60 * 1000),
      );

      expect(pruned.deleted).toBe(0);
      expect(await cachedPks()).toContain('9');
    });

    it('drops the cached rows of a window HOSxP emptied', async () => {
      // HOSxP has no row of the form any more: every cached row of the
      // window is gone and must not stay behind.
      await seedBmsConfig();
      await insertCached('9', stamp(INSIDE_WINDOW));
      mockWindowed({ windowRows: [] });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { reconcile: true });

      expect(r.deleted).toBe(1);
      expect(await cachedPks()).not.toContain('9');
    });
  });

  // ─── The label cache ──────────────────────────────────────────────────────
  //
  // The labels of a form change only when the SITE changes its form, so the
  // pull keeps them and reuses them instead of asking HOSxP on every cycle.
  describe('assessment metadata cache', () => {
    /** The cached forms of all three tables (the after-birth one is 309 — the
     *  form id the raw row below carries). */
    const CACHE_FORMS = [
      {
        assessment_form_id: 120,
        assessment_form_table: 'asm_first_pregnant_pt_nan',
        assessment_form_name: '[LR]-แรกรับ',
      },
      {
        assessment_form_id: 210,
        assessment_form_table: 'asm_lr_record_birth_period_nan',
        assessment_form_name: '[LR]-ระยะคลอด',
      },
      {
        assessment_form_id: 309,
        assessment_form_table: 'asm_lr_record_after_birth_nan',
        assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
      },
    ];

    async function storedFields(): Promise<string> {
      const stored = await db.query<{ fields_json: string }>(
        'SELECT fields_json FROM cached_maternity_assessments',
      );
      return JSON.stringify(stored[0]?.fields_json ?? '');
    }

    /** The labels of the stored row — what the UI shows. */
    async function fieldLabels(): Promise<string[]> {
      const stored = await db.query<{ fields_json: string }>(
        'SELECT fields_json FROM cached_maternity_assessments',
      );
      const raw: unknown = stored[0]?.fields_json;
      const parsed: unknown =
        typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw;
      if (!Array.isArray(parsed)) return [];
      return parsed.map((f) =>
        String((f as { label?: unknown }).label ?? ''),
      );
    }

    async function cachedRows(): Promise<{ form_table: string; form_id: number }[]> {
      return db.query<{ form_table: string; form_id: number }>(
        `SELECT form_table, form_id FROM cached_assessment_form_metadata
          WHERE hospital_id = ? ORDER BY form_table`,
        [HOSPITAL_ID],
      );
    }

    it('uses a warm cache and never asks HOSxP for the metadata', async () => {
      await seedBmsConfig();
      const spy = mockHosxp();
      await writeAssessmentMetadataCache(db, HOSPITAL_ID, CACHE_FORMS, ITEM_ROWS, new Date());

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(metadataQueries(spy)).toHaveLength(0);
      expect(r.upserted).toBe(1);
      // The rows are still labelled — from the cache.
      expect(await storedFields()).toContain('Systolic');
    });

    it('reads the metadata from HOSxP on a cold cache and fills the cache', async () => {
      await seedBmsConfig();
      const spy = mockHosxp();

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(metadataQueries(spy).length).toBeGreaterThan(0);
      expect(r.upserted).toBe(1);
      const cached = await db.query<{ form_table: string; form_id: number }>(
        'SELECT form_table, form_id FROM cached_assessment_form_metadata WHERE hospital_id = ? ORDER BY form_table',
        [HOSPITAL_ID],
      );
      const real = cached.filter((row) => row.form_id > 0);
      expect(real).toHaveLength(1);
      expect(real[0].form_table).toBe('asm_lr_record_after_birth_nan');
      expect(real[0].form_id).toBe(309);
      // The forms this site does not use are recorded too, so the next pull
      // knows it has seen everything without asking HOSxP again.
      expect(
        cached.filter((row) => row.form_id === UNUSED_FORM_ID).map((row) => row.form_table),
      ).toEqual([
        'asm_first_pregnant_pt_nan',
        'asm_lr_record_birth_period_nan',
      ]);
    });

    it('does not ask HOSxP for the metadata again at a site that uses one form', async () => {
      await seedBmsConfig();
      const spy = mockHosxp();
      // The mock site answers with ONE form (asm_lr_record_after_birth_nan).
      await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });
      spy.mockClear();

      await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(metadataQueries(spy)).toHaveLength(0);
    });

    it('labels the rows from a stale cache when HOSxP cannot be read', async () => {
      await seedBmsConfig();
      mockHosxp({ failMetadata: true });
      // A cache that is older than the TTL — it must still label the rows.
      await writeAssessmentMetadataCache(
        db,
        HOSPITAL_ID,
        CACHE_FORMS,
        ITEM_ROWS,
        new Date(Date.now() - 25 * 60 * 60 * 1000),
      );

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(r.upserted).toBe(1);
      expect(r.error).toBeNull();
      expect(await storedFields()).toContain('Systolic');
    });

    it('keeps the raw column names when HOSxP cannot be read and there is no cache', async () => {
      await seedBmsConfig();
      mockHosxp({ failMetadata: true });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(r.upserted).toBe(1);
      expect(r.error).toBeNull();
      const fields = await storedFields();
      expect(fields).toContain('asm_text2');
      expect(fields).not.toContain('Systolic');
    });

    it('reports the metadata failure — the pull of the rows itself still worked', async () => {
      // The rows landed, but they carry the raw HOSxP column names. The admin
      // has to see that: a pull that reports itself as healthy while every
      // field reads `asm_text12` is not healthy.
      await seedBmsConfig();
      mockHosxp({ failMetadata: true });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(r.metadataError).toContain('metadata');
      // The pull itself was fine — only the labels are missing.
      expect(r.error).toBeNull();
      expect(r.upserted).toBe(1);
    });

    it('reports no metadata failure when the labels came from the cache', async () => {
      await seedBmsConfig();
      mockHosxp({ failMetadata: true });
      await writeAssessmentMetadataCache(
        db,
        HOSPITAL_ID,
        CACHE_FORMS,
        ITEM_ROWS,
        new Date(Date.now() - 25 * 60 * 60 * 1000),
      );

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      // The read failed, but the rows were labelled from the cache — the
      // failure is still reported, because the next read may find nothing.
      expect(r.metadataError).toContain('metadata');
      expect(await storedFields()).toContain('Systolic');
    });

    it('re-reads the metadata when a row was recorded under a form version the cache does not know', async () => {
      // The site published a NEW version of the form (999) after the cache
      // was warmed. The cache must not label that row with the items of the
      // version it knows — the labels would be wrong and the cursor would
      // walk past the row for good.
      await seedBmsConfig();
      await writeAssessmentMetadataCache(db, HOSPITAL_ID, CACHE_FORMS, ITEM_ROWS, new Date());
      const spy = mockHosxp({
        forms: [
          {
            assessment_form_id: 309,
            assessment_form_table: 'asm_lr_record_after_birth_nan',
            assessment_form_name: 'after birth',
          },
          {
            assessment_form_id: 999,
            assessment_form_table: 'asm_lr_record_after_birth_nan',
            assessment_form_name: 'after birth v2',
          },
        ],
        items: [
          {
            assessment_form_id: 999,
            assessment_items_column: 'asm_text2',
            assessment_items_note: 'Systolic v2',
            assessment_component_name: 'TextEdit',
            assessment_data_type: 'VARCHAR(250)',
          },
        ],
        rows: [rawRow({ head_form_id: 999 })],
      });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      // The metadata was read again — the cache could not label the row.
      expect(metadataQueries(spy).length).toBeGreaterThan(0);
      expect(r.upserted).toBe(1);
      // The row carries ITS OWN version's label, not the cached version's.
      expect(await fieldLabels()).toContain('Systolic v2');
      expect(await fieldLabels()).not.toContain('Systolic');
    });

    it('does not write the cache when HOSxP answers with no form at all', async () => {
      // HOSxP answered, but with no form: nothing was learned. The cache must
      // NOT be written (not even the sentinels) — a fresh cache without a
      // single label would keep the pull from reading the metadata for a
      // whole TTL.
      await seedBmsConfig();
      mockHosxp({ emptyMetadata: true });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(r.upserted).toBe(1);
      expect(await cachedRows()).toHaveLength(0);
      // The rows keep their raw column names.
      expect(await fieldLabels()).toContain('asm_text2');
    });

    it('labels the rows from the stale cache when HOSxP answers with no form', async () => {
      await seedBmsConfig();
      mockHosxp({ emptyMetadata: true });
      await writeAssessmentMetadataCache(
        db,
        HOSPITAL_ID,
        CACHE_FORMS,
        ITEM_ROWS,
        new Date(Date.now() - 25 * 60 * 60 * 1000),
      );

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(r.upserted).toBe(1);
      expect(await fieldLabels()).toContain('Systolic');
      // The stale cache is kept as it is — nothing new was learned.
      expect((await cachedRows()).filter((row) => row.form_id === UNUSED_FORM_ID)).toHaveLength(0);
    });

    it('does not fall back to a cache that holds no label at all', async () => {
      // A cache of sentinels only: it knows the tables but carries no label.
      // Falling back to it would be the same as having no cache.
      await seedBmsConfig();
      mockHosxp({ failMetadata: true });
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO cached_assessment_form_metadata
           (id, hospital_id, form_table, form_id, form_name, items_json,
            synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'cam-sentinel-1',
          HOSPITAL_ID,
          'asm_lr_record_after_birth_nan',
          UNUSED_FORM_ID,
          null,
          '[]',
          now,
          now,
          now,
        ],
      );
      const warn = vi.spyOn(logger, 'warn');

      await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(warn.mock.calls.map((call) => call[0])).not.toContain(
        'assessment_metadata_cache_stale_used',
      );
    });

    it('keeps using the cache for an ORPHAN row — a version the site no longer lists', async () => {
      // The site deleted the form version 205 and keeps the rows it recorded
      // under it. HOSxP does not list 205 any more, so the row falls back to
      // the current version's items — exactly as it did before the cache
      // existed. That must NOT invalidate the cache (or the pull would read
      // the metadata and rewrite the cache on every single round).
      await seedBmsConfig();
      await writeAssessmentMetadataCache(db, HOSPITAL_ID, CACHE_FORMS, ITEM_ROWS, new Date());
      const spy = mockHosxp({ rows: [rawRow({ head_form_id: 205 })] });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(metadataQueries(spy)).toHaveLength(0);
      expect(r.upserted).toBe(1);
      // The cache still labels the row (with the current version's items).
      expect(await fieldLabels()).toContain('Systolic');
    });

    it('keeps using the cache for a row that carries no form id at all', async () => {
      // A row without a head_form_id falls back to the current version's
      // items. It must not be read as the form id 0 and invalidate the cache.
      await seedBmsConfig();
      await writeAssessmentMetadataCache(db, HOSPITAL_ID, CACHE_FORMS, ITEM_ROWS, new Date());
      const spy = mockHosxp({ rows: [rawRow({ head_form_id: null })] });

      const r = await pullMaternityAssessmentsFromHosxp(db, HOSPITAL_ID, { now: new Date() });

      expect(metadataQueries(spy)).toHaveLength(0);
      expect(r.upserted).toBe(1);
      expect(await fieldLabels()).toContain('Systolic');
    });
  });
});
