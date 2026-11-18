// Browser push — maternity assessment forms ([LR] แรกรับ / ระยะคลอด /
// หลังคลอด).
//
// The browser's push is a TRIGGER only: the server reads the rows from the
// hospital's HOSxP itself, so what lands in the cache is the hospital's own
// HOSxP content. A browser that reports a form it does not have cannot put
// a row into the cache — the rows in the push are ignored.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';
import { getLatestSyncRun } from '@/services/sync/progress-store';
import { BmsSessionClient } from '@/lib/bms-session';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => {} }));

import { POST } from '@/app/api/sync/browser-push/route';

const HCODE = '10716';

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/sync/browser-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function hospitalId(): Promise<string> {
  const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [HCODE]);
  return rows[0].id;
}

async function finalizedRun(hid: string) {
  for (let i = 0; i < 50; i++) {
    const run = await getLatestSyncRun(hid);
    if (run && run.outcome !== 'running') return run;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('sync run never finalized');
}

/** The form row HOSxP holds for one admission. */
const HOSXP_ROW = {
  asm_lr_record_after_birth_nan_id: 2418,
  an: 'AN-ASM-1',
  vn: 'VN-ASM-1',
  vnan: 'VN-ASM-1AN-ASM-1',
  patient_type: 'IPD',
  assessment_head_id: 1403829,
  asm_date1: '2026-11-17',
  asm_text2: '138',
  asm_chk1: 'Y',
  asm_memo3: 'มดลูกหดรัดตัวดี',
  asm_lk6: 'พญ.ศุภิสรา ชลยุทธ',
  head_datetime: '2026-11-17T21:03:15',
  head_staff: 'jcome',
  head_form_id: 309,
  patient_hn: '000285565',
};

/** Mock HOSxP the way the server sees it: the forms, their items, the rows. */
function mockHosxp(options: { rows?: Record<string, unknown>[] } = {}) {
  return vi
    .spyOn(BmsSessionClient.prototype, 'executeQuery')
    .mockImplementation(async (sql: string) => {
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
            assessment_form_table: 'asm_lr_record_after_birth_nan',
            assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
          },
        ]);
      }
      if (sql.includes('FROM assessment_items')) {
        return wrap([
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
        ]);
      }
      if (sql.includes('FROM asm_lr_record_after_birth_nan')) {
        return wrap(options.rows ?? [HOSXP_ROW]);
      }
      if (sql.includes('FROM asm_first_pregnant_pt_nan')) return wrap([]);
      if (sql.includes('FROM asm_lr_record_birth_period_nan')) return wrap([]);
      return wrap([]);
    });
}

async function seedBmsConfig(hid: string) {
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospital_bms_config
       (id, hospital_id, tunnel_url, session_jwt, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ['hbc-1', hid, 'http://tunnel.test', 'jwt-test', now, now],
  );
}

describe('POST /api/sync/browser-push — maternity assessment forms', () => {
  beforeEach(async () => {
    db = await createTestDb();
    await new SeedOrchestrator().run(db);
    mockSessionUser = testSessionUser({ hospitalCode: HCODE });
    const hid = await hospitalId();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'enc-name', 28, ?, 'ACTIVE', ?, ?, ?)`,
      ['pat-asm-1', hid, '000285565', 'AN-ASM-1', '2026-11-17T14:21:00', now, now, now],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the form from HOSxP and stores it with the labels the site defines', async () => {
    const hid = await hospitalId();
    await seedBmsConfig(hid);
    mockHosxp();

    const res = await POST(jsonRequest({ assessments: { hints: {} } }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assessments).toMatchObject({ upserted: 1, skipped: 0 });

    const stored = await db.query<{
      form_key: string;
      form_name: string;
      patient_id: string;
      fields_json: unknown;
    }>('SELECT form_key, form_name, patient_id, fields_json FROM cached_maternity_assessments');
    expect(stored).toHaveLength(1);
    expect(stored[0].form_key).toBe('after_birth');
    expect(stored[0].patient_id).toBe('pat-asm-1');
    const fields = JSON.stringify(stored[0].fields_json);
    expect(fields).toContain('Systolic');
    expect(fields).toContain('ได้ให้อาหารทางปาก');
    // The attending physician's name is stored encrypted, never in clear.
    expect(fields).not.toContain('ศุภิสรา');
  });

  it('ignores rows the browser pushes — it never writes them', async () => {
    const hid = await hospitalId();
    await seedBmsConfig(hid);
    mockHosxp({ rows: [] });

    const res = await POST(
      jsonRequest({
        assessments: {
          hints: {},
          records: {
            asm_lr_record_after_birth_nan: [
              { asm_lr_record_after_birth_nan_id: 9999, an: 'AN-ASM-1', asm_text2: '999' },
            ],
          },
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });

  it('moves the cursor to the position it stored', async () => {
    const hid = await hospitalId();
    await seedBmsConfig(hid);
    mockHosxp();

    const res = await POST(jsonRequest({ assessments: { hints: {} } }) as never);
    expect(res.status).toBe(200);
    const cursors = await db.query<{ form_table: string; cursor_pk: string }>(
      'SELECT form_table, cursor_pk FROM cached_maternity_assessment_cursors WHERE hospital_id = ?',
      [hid],
    );
    expect(cursors).toHaveLength(1);
    expect(cursors[0].form_table).toBe('asm_lr_record_after_birth_nan');
    expect(cursors[0].cursor_pk).toBe('2418');
  });

  it('keeps the cursor still when the server cannot reach HOSxP', async () => {
    // No hospital_bms_config — the rows cannot be read authoritatively, so
    // nothing is stored and the pull position waits.
    const res = await POST(jsonRequest({ assessments: { hints: {} } }) as never);
    expect(res.status).toBe(200);
    const hid = await hospitalId();
    const cursors = await db.query(
      'SELECT form_table FROM cached_maternity_assessment_cursors WHERE hospital_id = ?',
      [hid],
    );
    expect(cursors).toHaveLength(0);
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });

  it('records the persist step in the sync trail', async () => {
    const hid = await hospitalId();
    await seedBmsConfig(hid);
    mockHosxp();

    const res = await POST(jsonRequest({ assessments: { hints: {} } }) as never);
    expect(res.status).toBe(200);
    const run = await finalizedRun(hid);
    const step = run.steps.find((s) => s.name === 'persist_assessments' && s.status !== 'running');
    expect(step).toBeDefined();
    expect(step!.status).toBe('success');
    expect(step!.counts).toMatchObject({ upserted: 1, skipped: 0 });
  });
});
