// Browser push — maternity assessment forms ([LR] แรกรับ / ระยะคลอด /
// หลังคลอด).
//
// The browser reads the raw rows from HOSxP and pushes them together with the
// form metadata; the server labels every positional column, encrypts the
// name-bearing ones and stores the form. These tests drive the real route
// handler so the whole browser-push → cache path is covered.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../../helpers/session';
import { getLatestSyncRun } from '@/services/sync/progress-store';

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

function assessmentPayload() {
  return {
    forms: [
      {
        assessment_form_id: 309,
        assessment_form_table: 'asm_lr_record_after_birth_nan',
        assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
      },
    ],
    items: [
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
    ],
    records: {
      asm_lr_record_after_birth_nan: [
        {
          asm_lr_record_after_birth_nan_id: 2418,
          an: 'AN-ASM-1',
          patient_type: 'IPD',
          assessment_head_id: 1403829,
          asm_date1: '2026-11-17',
          asm_text2: '138',
          asm_chk1: 'Y',
          asm_lk6: 'พญ.ศุภิสรา ชลยุทธ',
          head_datetime: '2026-11-17T21:03:15',
          head_staff: 'jcome',
          patient_hn: '000285565',
        },
      ],
    },
  };
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

  it('persists the labelled form and reports the counters', async () => {
    const res = await POST(jsonRequest({ assessments: assessmentPayload() }) as never);
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

  it('records the persist step in the sync trail', async () => {
    const res = await POST(jsonRequest({ assessments: assessmentPayload() }) as never);
    expect(res.status).toBe(200);
    const hid = await hospitalId();
    const run = await finalizedRun(hid);
    const step = run.steps.find((s) => s.name === 'persist_assessments' && s.status !== 'running');
    expect(step).toBeDefined();
    expect(step!.status).toBe('success');
    expect(step!.counts).toMatchObject({ upserted: 1, skipped: 0 });
  });

  it('advances the form cursor so the next pull resumes after the last row', async () => {
    const res = await POST(jsonRequest({ assessments: assessmentPayload() }) as never);
    expect(res.status).toBe(200);
    const hid = await hospitalId();
    const cursors = await db.query<{ form_table: string; cursor_pk: string }>(
      'SELECT form_table, cursor_pk FROM cached_maternity_assessment_cursors WHERE hospital_id = ?',
      [hid],
    );
    expect(cursors).toHaveLength(1);
    expect(cursors[0].form_table).toBe('asm_lr_record_after_birth_nan');
    expect(cursors[0].cursor_pk).toBe('2418');
  });

  it('refuses an unknown assessment table and stores nothing', async () => {
    const payload = assessmentPayload();
    const res = await POST(
      jsonRequest({
        assessments: {
          ...payload,
          records: { asm_something_else: payload.records.asm_lr_record_after_birth_nan },
        },
      }) as never,
    );
    expect(res.status).toBe(200);
    const hid = await hospitalId();
    const run = await finalizedRun(hid);
    const step = run.steps.find((s) => s.name === 'persist_assessments' && s.status !== 'running');
    expect(step?.status).toBe('error');
    const stored = await db.query('SELECT id FROM cached_maternity_assessments');
    expect(stored).toHaveLength(0);
  });
});
