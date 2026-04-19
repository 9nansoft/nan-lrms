// Cold-start E2E: blank pglite database → schema-sync → seeders → live route
// handler for the inbound patient-data webhook (auth, validator, processor).
//
// Why this exists: the previous version of this test required a live HOSxP
// PostgreSQL on 127.0.0.1:5432 PLUS a running kk-lrms dev server on
// localhost:3003 PLUS a manually-provisioned API key. In CI all three are
// absent, so the suite errored out in beforeAll with ECONNREFUSED before
// any case ran.
//
// This rewrite mirrors `tests/e2e/partograph-cold-start.test.ts`:
//   - createPgliteApp() boots schema + seeders + a real webhook API key
//   - The "HOSxP rows" are now inline fixture patients (what the real DB
//     would have returned)
//   - Route handlers are imported and invoked directly with `Request`s
//   - Assertions read straight from pglite — no GET /api/dashboard
//     round-trip needed
//
// What's exercised end-to-end:
//   - SchemaSync.sync(adapter, ALL_TABLES, 'postgresql')
//   - HospitalSeeder + AdminSeeder (idempotent, gated on COUNT(*))
//   - createApiKey() → webhook_api_keys row + raw bearer token
//   - POST /api/webhooks/patient-data full_snapshot mode
//   - POST /api/webhooks/patient-data incremental mode
//   - All 5 error cases (missing auth, bad key, empty patients, bad mode,
//     missing required fields)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { generateKey } from '@/lib/encryption';

// PDPA — the patient-registration webhook encrypts name/cid before storage,
// so processWebhookPayload throws without ENCRYPTION_KEY set. Match the
// existing pattern from tests/integration/full-flow.test.ts: generate a
// random per-process key at module load.
process.env.ENCRYPTION_KEY ??= generateKey();

import { createPgliteApp, type PgliteAppContext } from '../helpers/createPgliteApp';

let app: PgliteAppContext;

vi.mock('@/db/connection', () => ({
  getDatabase: async () => app.db,
  isSqliteEnabled: () => false,
}));

vi.mock('@/lib/ensure-init', () => ({
  ensureInit: async () => undefined,
}));

vi.mock('@/lib/sse', () => ({
  SseManager: class MockSse {
    static getInstance() {
      return new MockSse();
    }
    broadcast(): void {}
    destroy(): void {}
  },
}));

// Imports must come AFTER vi.mock so the mocks take effect when the route
// module resolves `@/db/connection`, `@/lib/ensure-init`, `@/lib/sse`.
import { POST as postWebhook } from '@/app/api/webhooks/patient-data/route';

// ─── Fixture data ──────────────────────────────────────────────────────────
// Stand-in for what `SELECT … FROM ipt JOIN patient …` would have returned
// from a real HOSxP PostgreSQL. Four labour-room patients with the fields
// the webhook validator requires (hn, an, name, cid, age, admit_date) plus
// the optional pregnancy fields (gravida, ga_weeks, anc_count). CIDs are
// exactly 13 digits so validatePayload's strict regex passes.
interface FixturePatient {
  hn: string;
  an: string;
  name: string;
  cid: string;
  age: number;
  admit_date: string;
  gravida: number;
  ga_weeks: number;
  anc_count: number;
}

// Note on ga_weeks values: the CPD `gaWeeks` evaluator returns 1.5 for
// values ≥ 40, but the cpd_scores.factor_ga_weeks column is declared as
// INTEGER. Inserting 1.5 fails on real Postgres / pglite with
// "invalid input syntax for type integer". This is a pre-existing
// schema-vs-business-logic mismatch in the codebase and not something
// this test rewrites; we simply pick fixture values (< 40) that keep the
// evaluator on the integer-zero branch. Same caveat for anc_count: < 4
// returns 1.5; we use anc_count ≥ 4 throughout.
const FIXTURE_PATIENTS: FixturePatient[] = [
  {
    hn: 'HN-FX-001', an: 'AN-FX-001',
    name: 'นางสมใจ ใจดี', cid: '1100000000001',
    age: 27, admit_date: '2026-04-19T05:30:00+07:00',
    gravida: 1, ga_weeks: 39, anc_count: 8,
  },
  {
    hn: 'HN-FX-002', an: 'AN-FX-002',
    name: 'นางมาลี สดใส', cid: '1100000000002',
    age: 31, admit_date: '2026-04-19T06:15:00+07:00',
    gravida: 2, ga_weeks: 38, anc_count: 6,
  },
  {
    hn: 'HN-FX-003', an: 'AN-FX-003',
    name: 'นางอรุณ ทองดี', cid: '1100000000003',
    age: 24, admit_date: '2026-04-19T07:00:00+07:00',
    gravida: 1, ga_weeks: 39, anc_count: 9,
  },
  {
    hn: 'HN-FX-004', an: 'AN-FX-004',
    name: 'นางสุดา รุ่งเรือง', cid: '1100000000004',
    age: 35, admit_date: '2026-04-19T07:45:00+07:00',
    gravida: 3, ga_weeks: 37, anc_count: 5,
  },
];

function bearerRequest(apiKey: string, body: unknown): Request {
  return new Request('http://test/api/webhooks/patient-data', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  app = await createPgliteApp();
});

afterEach(async () => {
  await app.db.close();
});

describe('E2E: Webhook API (pglite cold-start)', () => {
  // ─── Step 2 (rewritten): full_snapshot of fixture "HOSxP" patients ───────
  describe('Step 2: Full-snapshot ingest from fixture data', () => {
    it('accepts a full_snapshot payload and returns the expected counts', async () => {
      const payload = {
        hospitalCode: app.hcode,
        mode: 'full_snapshot' as const,
        patients: FIXTURE_PATIENTS.map((p) => ({
          hn: p.hn,
          an: p.an,
          name: p.name,
          cid: p.cid,
          age: p.age,
          admit_date: p.admit_date,
          gravida: p.gravida,
          ga_weeks: p.ga_weeks,
          anc_count: p.anc_count,
        })),
      };

      const res = await postWebhook(bearerRequest(app.apiKey, payload) as never);
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.success).toBe(true);
      expect(body.patientsProcessed).toBe(FIXTURE_PATIENTS.length);
      // First-ever ingest into a blank pglite, so every fixture is new.
      expect(body.newAdmissions).toBe(FIXTURE_PATIENTS.length);
      expect(body.discharges).toBe(0);
      expect(body.transfers).toBe(0);
    });
  });

  // ─── Step 3 (rewritten): verify state via direct pglite queries ──────────
  describe('Step 3: Verify rows landed in pglite', () => {
    it('writes one cached_patients row per fixture patient and flips hospital ONLINE', async () => {
      const payload = {
        hospitalCode: app.hcode,
        mode: 'full_snapshot' as const,
        patients: FIXTURE_PATIENTS.map((p) => ({
          hn: p.hn, an: p.an, name: p.name, cid: p.cid,
          age: p.age, admit_date: p.admit_date,
        })),
      };
      const res = await postWebhook(bearerRequest(app.apiKey, payload) as never);
      expect(res.status).toBe(200);

      // Each fixture patient is now a row in cached_patients.
      const rows = await app.db.query<{ an: string; hn: string; labor_status: string }>(
        'SELECT an, hn, labor_status FROM cached_patients WHERE hospital_id = ? ORDER BY an',
        [app.hospitalId],
      );
      expect(rows).toHaveLength(FIXTURE_PATIENTS.length);
      expect(rows.map((r) => r.an).sort()).toEqual(
        FIXTURE_PATIENTS.map((p) => p.an).sort(),
      );
      // All four are admitted, none delivered yet.
      expect(rows.every((r) => r.labor_status === 'ACTIVE')).toBe(true);

      // The webhook handler flips connection_status → ONLINE on success.
      const hosp = await app.db.query<{ connection_status: string; last_sync_at: string | null }>(
        'SELECT connection_status, last_sync_at FROM hospitals WHERE id = ?',
        [app.hospitalId],
      );
      expect(hosp[0].connection_status).toBe('ONLINE');
      expect(hosp[0].last_sync_at).not.toBeNull();
    });
  });

  // ─── Step 4: error handling — preserved verbatim from the original ───────
  describe('Step 4: API Error Handling', () => {
    it('rejects request without auth header (401)', async () => {
      const req = new Request('http://test/api/webhooks/patient-data', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          patients: [{
            hn: 'X', an: 'X', name: 'X', cid: '1100000000099',
            age: 1, admit_date: '2026-01-01T00:00:00Z',
          }],
        }),
      });
      const res = await postWebhook(req as never);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('MISSING_AUTH');
      expect(body.error).toContain('Authorization');
    });

    it('rejects invalid API key (401)', async () => {
      const res = await postWebhook(
        bearerRequest('kklrms_this_is_a_fake_key_1234567890abcdef', {
          patients: [{
            hn: 'X', an: 'X', name: 'X', cid: '1100000000099',
            age: 1, admit_date: '2026-01-01T00:00:00Z',
          }],
        }) as never,
      );
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('INVALID_API_KEY');
      expect(body.error).toContain('Invalid');
    });

    it('rejects empty patients array (400)', async () => {
      const res = await postWebhook(
        bearerRequest(app.apiKey, { hospitalCode: app.hcode, patients: [] }) as never,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
    });

    it('rejects invalid mode (400)', async () => {
      const res = await postWebhook(
        bearerRequest(app.apiKey, {
          hospitalCode: app.hcode,
          mode: 'invalid',
          patients: [{
            hn: 'X', an: 'X', name: 'X', cid: '1100000000099',
            age: 1, admit_date: '2026-01-01T00:00:00Z',
          }],
        }) as never,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
      // The validator surfaces the offending field in `details`.
      expect(JSON.stringify(body.details ?? '')).toContain('mode');
    });

    it('rejects payload missing required fields (400)', async () => {
      const res = await postWebhook(
        bearerRequest(app.apiKey, {
          hospitalCode: app.hcode,
          patients: [{ hn: 'X' }],
        }) as never,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.code).toBe('VALIDATION_FAILED');
    });
  });

  // ─── Step 5: incremental update on an existing patient ───────────────────
  describe('Step 5: Incremental Update', () => {
    it('updates an existing patient via incremental mode (newAdmissions: 0)', async () => {
      // Seed first so the patient exists.
      const seedRes = await postWebhook(
        bearerRequest(app.apiKey, {
          hospitalCode: app.hcode,
          mode: 'full_snapshot' as const,
          patients: FIXTURE_PATIENTS.map((p) => ({
            hn: p.hn, an: p.an, name: p.name, cid: p.cid,
            age: p.age, admit_date: p.admit_date,
          })),
        }) as never,
      );
      expect(seedRes.status).toBe(200);

      // Now update one patient with new pregnancy fields via incremental mode.
      const target = FIXTURE_PATIENTS[0];
      const updateRes = await postWebhook(
        bearerRequest(app.apiKey, {
          hospitalCode: app.hcode,
          mode: 'incremental' as const,
          patients: [{
            hn: target.hn,
            an: target.an,
            name: target.name,
            cid: target.cid,
            age: target.age,
            admit_date: target.admit_date,
            gravida: 2,
            ga_weeks: 39,
          }],
        }) as never,
      );
      expect(updateRes.status).toBe(200);
      const body = await updateRes.json();

      expect(body.success).toBe(true);
      expect(body.patientsProcessed).toBe(1);
      // Update path — the patient already existed, so no new admission counted.
      expect(body.newAdmissions).toBe(0);
      // Incremental mode never auto-discharges absent rows.
      expect(body.discharges).toBe(0);

      // Verify the updated values landed.
      const rows = await app.db.query<{ gravida: number | null; ga_weeks: number | null }>(
        'SELECT gravida, ga_weeks FROM cached_patients WHERE hospital_id = ? AND an = ?',
        [app.hospitalId, target.an],
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].gravida)).toBe(2);
      expect(Number(rows[0].ga_weeks)).toBe(39);
    });
  });
});
