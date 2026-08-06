// TDD — statistics-mode context builder.
//
// REGRESSION (2026-08-06): the dashboard chatbot could not answer
// "ตอนนี้มีคนรอคลอดกี่คน". Root cause: /api/chat passes the SESSION's
// `hospitalCode` (a 5-digit hcode, e.g. '10670') but this builder filtered
// `hospitals.id` (a varchar-36 uuid) and `cached_patients.hospital_id`.
// Result: zero rows → null → empty context → the statistics system prompt
// ("use only the numbers given; if none, say there is no data") made the model
// answer "ไม่มีข้อมูล" every time.
//
// The contract these tests pin:
//   1. the parameter is the session HCODE, never the internal uuid
//   2. the main dashboard is province-wide, so the province totals are always
//      present — even for a user with no/unknown hospital scope (never null)
//   3. the numbers and labels mirror the dashboard the user is looking at
//      (ในห้องคลอด / ANC กำลังติดตาม / คลอดแล้ว·เดือนนี้)
//   4. aggregates only — no patient names/CIDs/HNs ever reach the prompt
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { buildStatisticsContext } from '@/services/chat/stats-context-builder';

let db: DatabaseAdapter;
process.env.ENCRYPTION_KEY = generateKey();

describe('buildStatisticsContext — dashboard-aligned aggregates, no PHI', () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.close?.();
  });

  /** h1 (hcode 10670) = 2 patients in labor; h2 (hcode 11002) = 1. */
  async function seedProvince() {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, created_at, updated_at)
       VALUES ('h1', '10670', 'รพ.ทดสอบหนึ่ง', 'M2', true, ?, ?)`,
      [now, now],
    );
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, created_at, updated_at)
       VALUES ('h2', '11002', 'รพ.ทดสอบสอง', 'F2', true, ?, ?)`,
      [now, now],
    );
    const patients: Array<[string, string, string]> = [
      ['p1', 'h1', 'HN-1'],
      ['p2', 'h1', 'HN-2'],
      ['p3', 'h2', 'HN-3'],
    ];
    for (const [id, hospitalId, hn] of patients) {
      await db.execute(
        `INSERT INTO cached_patients (id, hospital_id, hn, an, name, cid, cid_hash, age, labor_status, admit_date, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 30, 'ACTIVE', ?, ?, ?, ?)`,
        [
          id,
          hospitalId,
          hn,
          `AN-${id}`,
          `encname-${id}`,
          `enccid-${id}`,
          `sha-${id}`,
          now,
          now,
          now,
          now,
        ],
      );
    }
    // A delivered patient must NOT be counted as waiting to deliver.
    await db.execute(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, cid, cid_hash, age, labor_status, admit_date, synced_at, created_at, updated_at)
       VALUES ('p4', 'h1', 'HN-4', 'AN-4', 'encname-p4', 'enccid-p4', 'sha-p4', 30, 'DELIVERED', ?, ?, ?, ?)`,
      [now, now, now, now],
    );
  }

  it('resolves the session HCODE (regression: hcode was filtered as hospitals.id)', async () => {
    await seedProvince();
    // '10670' is exactly what session.user.hospitalCode carries.
    const ctx = await buildStatisticsContext(db, '10670');
    expect(ctx.hospitalName).toBe('รพ.ทดสอบหนึ่ง');
    expect(ctx.hospitalCode).toBe('10670');
    expect(ctx.context).toContain('รพ.ทดสอบหนึ่ง');
  });

  it('answers "มีคนรอคลอดกี่คน" with the province-wide in-labor total', async () => {
    await seedProvince();
    const ctx = await buildStatisticsContext(db, '10670');
    // 3 ACTIVE across the province; the DELIVERED row is excluded.
    expect(ctx.provinceInLabor).toBe(3);
    expect(ctx.context).toContain('รอคลอด');
    expect(ctx.context).toMatch(/ในห้องคลอด/);
    expect(ctx.context).toContain('3');
  });

  it('still returns province-wide numbers when the session has no hospital scope', async () => {
    await seedProvince();
    // Provincial/central users have no meaningful hcode — the main dashboard
    // is province-wide, so the bot must still be able to answer.
    const ctx = await buildStatisticsContext(db, undefined);
    expect(ctx.provinceInLabor).toBe(3);
    expect(ctx.hospitalName).toBeNull();
    expect(ctx.context).toContain('รอคลอด');
  });

  it('never returns null for an unknown hcode (degrades to province scope)', async () => {
    await seedProvince();
    const ctx = await buildStatisticsContext(db, '99999');
    expect(ctx).not.toBeNull();
    expect(ctx.hospitalName).toBeNull();
    expect(ctx.provinceInLabor).toBe(3);
  });

  it('breaks the in-labor total down per hospital so "which hospital" is answerable', async () => {
    await seedProvince();
    const ctx = await buildStatisticsContext(db, '10670');
    expect(ctx.context).toContain('รพ.ทดสอบหนึ่ง');
    expect(ctx.context).toContain('รพ.ทดสอบสอง');
    expect(ctx.context).toContain('10670');
    expect(ctx.context).toContain('11002');
  });

  it('emits aggregates only — never a name, CID, cid_hash or HN', async () => {
    await seedProvince();
    const ctx = await buildStatisticsContext(db, '10670');
    const block = ctx.context;
    expect(block).not.toContain('encname-p1');
    expect(block).not.toContain('enccid-p1');
    expect(block).not.toContain('sha-p1');
    expect(block).not.toContain('HN-1');
    expect(block).not.toContain('AN-p1');
  });

  it('stamps the data with a timestamp so the answer can state its as-of time', async () => {
    await seedProvince();
    const ctx = await buildStatisticsContext(db, '10670');
    expect(ctx.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ctx.context).toContain('ณ');
  });

  it('works on an empty province without throwing', async () => {
    const ctx = await buildStatisticsContext(db, '10670');
    expect(ctx.provinceInLabor).toBe(0);
    expect(ctx.context).toContain('รอคลอด');
  });
});
