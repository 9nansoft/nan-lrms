// Integration roundtrip: browser push → cache → patient API → ward UI.
//
// The [LR] maternity forms reach the ward through the browser push. The push
// is only the TRIGGER: the server reads the rows from HOSxP itself (a
// browser cannot put a row into the cache), labels them with the site's own
// form definition and stores them in the cache. The patient detail page then
// reads them back through GET /api/patients/[hcode-an]/assessments.
//
// This test walks the whole way with the code that ships:
//   1. POST /api/sync/browser-push — the route handler itself.
//   2. The cache — what the pull stored (labels from HOSxP, names encrypted).
//   3. GET /api/patients/[hcode-an]/assessments — the route handler the
//      patient detail page calls via SWR.
//   4. <AssessmentForms /> — the component the ward renders.
//
// Database: pglite (real Postgres dialect) so the production SQL — the
// hospital-scoped cache read, the JSONB fields, the TIMESTAMPTZ — runs as it
// ships.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { v4 as uuidv4 } from 'uuid';
import { createTestDb } from '../helpers/testDb';
import { SeedOrchestrator } from '@/db/seeds/index';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { testSessionUser } from '../helpers/session';
import { BmsSessionClient } from '@/lib/bms-session';
import type { BmsQueryResult } from '@/types/bms-session';
import type { MaternityAssessmentsResponse } from '@/types/maternity-assessments';

process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? generateKey();

let db: DatabaseAdapter;
let hospitalId: string;
let mockSessionUser: Record<string, unknown> | null = null;

vi.mock('@/db/connection', () => ({ getDatabase: async () => db }));
vi.mock('@/lib/ensure-init', () => ({ ensureInit: async () => undefined }));
vi.mock('@/lib/auth', () => ({
  auth: async () => (mockSessionUser ? { user: mockSessionUser } : null),
}));

// Imported AFTER the mocks are registered — the route handlers read the
// database and the session through them.
import { POST as browserPush } from '@/app/api/sync/browser-push/route';
import { GET as getAssessments } from '@/app/api/patients/[an]/assessments/route';
import { AssessmentForms } from '@/components/maternity/AssessmentForms';

const HCODE = '10670';
const AN = 'AN-RT-ASM';
const HN = 'HN-RT-ASM';
const TABLE = 'asm_lr_record_after_birth_nan';
/** The name HOSxP holds in the form — it must never sit in the cache in clear. */
const ATTENDING = 'พญ.ศุภิสรา ชลยุทธ';

function jsonRequest(body: unknown): Request {
  return new Request('http://test/api/sync/browser-push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** The HOSxP of the test site: one form, one row, the site's own labels. */
function mockHosxpSite(): void {
  vi.spyOn(BmsSessionClient.prototype, 'executeQuery').mockImplementation(
    async (sql: string): Promise<BmsQueryResult> => {
      const wrap = (data: Record<string, unknown>[]): BmsQueryResult => ({
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
            assessment_items_column: 'asm_lk6',
            assessment_items_note: 'Attending Physician',
            assessment_component_name: 'LookupComboBox',
            assessment_data_type: 'VARCHAR(100)',
          },
        ]);
      }
      if (sql.includes(`FROM ${TABLE}`)) {
        return wrap([
          {
            asm_lr_record_after_birth_nan_id: 2418,
            an: AN,
            patient_type: 'IPD',
            assessment_head_id: 1403829,
            asm_date1: '2026-11-17',
            asm_text2: '138',
            asm_lk6: ATTENDING,
            head_datetime: '2026-11-17T21:03:15',
            head_staff: 'jcome',
            head_form_id: 309,
            patient_hn: HN,
          },
        ]);
      }
      return wrap([]);
    },
  );
}

beforeEach(async () => {
  db = await createTestDb();
  await new SeedOrchestrator().run(db);
  mockSessionUser = testSessionUser({ hospitalCode: HCODE });

  const rows = await db.query<{ id: string }>(
    'SELECT id FROM hospitals WHERE hcode = ?',
    [HCODE],
  );
  hospitalId = rows[0].id;

  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO cached_patients
       (id, hospital_id, hn, an, name, age, admit_date,
        labor_status, synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'enc-name', 28, '2026-11-17T14:21:00', 'ACTIVE', ?, ?, ?)`,
    [uuidv4(), hospitalId, HN, AN, now, now, now],
  );

  // The hospital's HOSxP link — the route pulls the forms when it exists, and
  // the stored session lets the pull run without asking for a new one.
  await db.execute(
    `INSERT INTO hospital_bms_config
       (id, hospital_id, tunnel_url, session_jwt, session_expires_at,
        created_at, updated_at)
     VALUES (?, ?, 'https://tunnel.test', 'jwt-test', ?, ?, ?)`,
    [
      uuidv4(),
      hospitalId,
      new Date(Date.now() + 3600_000).toISOString(),
      now,
      now,
    ],
  );

  mockHosxpSite();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('maternity assessment browser push → cache → API → UI', () => {
  it('carries one form from the push all the way to the ward', async () => {
    // ── Step 1: the browser pushes. The body carries no forms at all: the
    // server reads them from HOSxP itself. ──
    const res = await browserPush(jsonRequest({ assessments: { hints: {} } }) as never);
    expect(res.status).toBe(200);

    // ── Step 2: the cache holds what the pull stored. ──
    const stored = await db.query<{
      form_key: string;
      an: string;
      entry_staff: string | null;
      fields_json: unknown;
    }>(
      `SELECT form_key, an, entry_staff, fields_json
         FROM cached_maternity_assessments WHERE hospital_id = ?`,
      [hospitalId],
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].form_key).toBe('after_birth');
    expect(stored[0].an).toBe(AN);
    expect(stored[0].entry_staff).toBe('jcome');
    // The label comes from the site's own form definition — not from a
    // hardcoded field list — and the attending physician's name is
    // encrypted at rest (PDPA).
    const fields = JSON.stringify(stored[0].fields_json);
    expect(fields).toContain('Systolic');
    expect(fields).not.toContain('ศุภิสรา');

    // ── Step 3: the patient detail page reads the forms back. ──
    const apiRes = await getAssessments(
      {} as never,
      { params: Promise.resolve({ an: `${HCODE}-${AN}` }) },
    );
    expect(apiRes.status).toBe(200);
    const body = (await apiRes.json()) as MaternityAssessmentsResponse;

    expect(body.assessments).toHaveLength(1);
    const form = body.assessments[0];
    expect(form.formKey).toBe('after_birth');
    expect(form.formTable).toBe(TABLE);
    expect(form.recordedDate).toBe('2026-11-17');
    expect(form.entryStaff).toBe('jcome');
    expect(form.fields.find((f) => f.column === 'asm_text2')).toMatchObject({
      label: 'Systolic',
      value: '138',
    });
    // The name is decrypted at the read boundary.
    expect(form.fields.find((f) => f.column === 'asm_lk6')?.value).toBe(ATTENDING);

    // ── Step 4: the ward renders the form. ──
    render(<AssessmentForms assessments={body.assessments} />);
    expect(screen.getByText('Systolic')).toBeTruthy();
    expect(screen.getByText('138')).toBeTruthy();
    expect(screen.getByText(ATTENDING)).toBeTruthy();
    // The form's title comes from the config — one source of truth.
    expect(screen.getByText('หลังคลอด')).toBeTruthy();
  });

  it('shows nothing when the hospital recorded no form', async () => {
    // HOSxP has no row of the form: the cache stays empty and the ward says
    // so instead of showing an empty form.
    vi.restoreAllMocks();
    vi.spyOn(BmsSessionClient.prototype, 'executeQuery').mockImplementation(
      async (): Promise<BmsQueryResult> => ({
        data: [],
        field: [],
        field_name: [],
        record_count: 0,
      }),
    );

    const res = await browserPush(jsonRequest({}) as never);
    expect(res.status).toBe(200);

    const stored = await db.query<{ n: number }>(
      'SELECT COUNT(*) AS n FROM cached_maternity_assessments WHERE hospital_id = ?',
      [hospitalId],
    );
    expect(Number(stored[0].n)).toBe(0);

    const apiRes = await getAssessments(
      {} as never,
      { params: Promise.resolve({ an: `${HCODE}-${AN}` }) },
    );
    expect(apiRes.status).toBe(200);
    const body = (await apiRes.json()) as MaternityAssessmentsResponse;
    expect(body.assessments).toHaveLength(0);

    render(<AssessmentForms assessments={body.assessments} />);
    expect(screen.getByText('ยังไม่มีแบบฟอร์มประเมินที่ซิงก์เข้ามา')).toBeTruthy();
  });
});
