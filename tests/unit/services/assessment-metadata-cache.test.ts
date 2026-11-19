// Assessment metadata cache — the label cache that keeps the server pull
// from re-reading `assessment_form` / `assessment_items` from HOSxP.
//
// The rules under test:
//   1. A write/read roundtrip returns the SAME forms and items.
//   2. A second write of the same form version UPDATES it in place — the
//      cache never grows a duplicate row for one form version.
//   3. EVERY form version is kept: a site that keeps an older version of a
//      form still has rows recorded under it, and those rows are labelled
//      with THAT version's items.
//   4. Freshness is decided by the clock the caller passes in (no hidden
//      Date.now()): inside the TTL the cache is fresh, outside it stale.
//   5. Freshness follows the OLDEST row: one stale row makes the whole
//      cache stale (MAX would let a fresh row mask an old one).
//   6. The cache mirrors HOSxP's CURRENT form set — a version the site
//      deleted must not survive in it.
//   7. The write is atomic: a refused row rolls the whole set back.
//   8. A form id of 0 is a REAL form id — the sentinel marker cannot
//      collide with it.
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  readAssessmentMetadataCache,
  writeAssessmentMetadataCache,
  isAssessmentMetadataCacheFresh,
  UNUSED_FORM_ID,
} from '@/services/assessment-metadata-cache';

let db: DatabaseAdapter;
const HOSPITAL_ID = 'h-amc-1';

const FORMS = [
  {
    assessment_form_id: 309,
    assessment_form_table: 'asm_lr_record_after_birth_nan',
    assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด',
  },
  {
    // The SAME table, an older version of the form.
    assessment_form_id: 205,
    assessment_form_table: 'asm_lr_record_after_birth_nan',
    assessment_form_name: '[LR]-แบบฟอร์มการบันทึกการพยาบาลระยะหลังคลอด (เวอร์ชันเดิม)',
  },
];

const ITEMS = [
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
    assessment_form_id: 205,
    assessment_items_column: 'asm_text2',
    assessment_items_note: 'ความดันซิสโตลิก',
    assessment_component_name: 'TextEdit',
    assessment_data_type: 'VARCHAR(250)',
  },
];

beforeEach(async () => {
  db = await createTestDb();
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO hospitals (id, hcode, name, level, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [HOSPITAL_ID, '10716', 'Test', 'M2', now, now],
  );
});

describe('assessment metadata cache', () => {
  it('returns the same forms and items after a write', async () => {
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, ITEMS);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    expect(cached.forms).toHaveLength(2);
    expect(cached.items).toHaveLength(3);
    expect(cached.forms.map((f) => f.assessment_form_id).sort()).toEqual([205, 309]);
    expect(
      cached.forms.find((f) => f.assessment_form_id === 309)?.assessment_form_name,
    ).toContain('หลังคลอด');
    expect(cached.items.find((i) => i.assessment_items_column === 'asm_chk1')).toMatchObject({
      assessment_form_id: 309,
      assessment_items_note: 'ได้ให้อาหารทางปาก',
      assessment_component_name: 'CheckBox',
      assessment_data_type: 'VARCHAR(100)',
    });
  });

  it('keeps EVERY form version — an older version keeps its own items', async () => {
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, ITEMS);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    const oldItems = cached.items.filter((i) => Number(i.assessment_form_id) === 205);
    expect(oldItems).toHaveLength(1);
    expect(oldItems[0].assessment_items_note).toBe('ความดันซิสโตลิก');
  });

  it('updates a form version in place instead of duplicating it', async () => {
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, ITEMS);
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, [
      { ...ITEMS[0], assessment_items_note: 'ความดันซิสโตลิก' },
      ITEMS[1],
      ITEMS[2],
    ]);

    const rows = await db.query<{ id: string; form_id: number }>(
      'SELECT id, form_id FROM cached_assessment_form_metadata WHERE hospital_id = ?',
      [HOSPITAL_ID],
    );
    // Two form versions — no duplicate for either of them. (The tables the
    // site does not use are recorded as sentinels; they are counted apart.)
    expect(rows.filter((row) => row.form_id > 0)).toHaveLength(2);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);
    const systolic = cached.items.find(
      (i) => Number(i.assessment_form_id) === 309 && i.assessment_items_column === 'asm_text2',
    );
    expect(systolic?.assessment_items_note).toBe('ความดันซิสโตลิก');
  });

  it('records a form the site does not use, so the cache still covers every form', async () => {
    // A site that uses ONE of the three forms: the two it does not use have
    // no `assessment_form` row, so the cache must record them anyway — or the
    // pull can never know it has seen everything and asks HOSxP every cycle.
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, [FORMS[0]], [ITEMS[0], ITEMS[1]]);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    // Only the form the site really has is handed to the labelling path.
    expect(cached.forms.map((f) => f.assessment_form_table)).toEqual([
      'asm_lr_record_after_birth_nan',
    ]);
    // But the cache knows every table, so it can answer the pull on its own.
    expect([...cached.coveredTables].sort()).toEqual([
      'asm_first_pregnant_pt_nan',
      'asm_lr_record_after_birth_nan',
      'asm_lr_record_birth_period_nan',
    ]);
  });

  it('is fresh inside the TTL and stale outside it', async () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    await writeAssessmentMetadataCache(
      db,
      HOSPITAL_ID,
      FORMS,
      ITEMS,
      new Date(now.getTime() - 1_000),
    );

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);
    expect(isAssessmentMetadataCacheFresh(cached.syncedAt, 60_000, now)).toBe(true);
    expect(isAssessmentMetadataCacheFresh(cached.syncedAt, 500, now)).toBe(false);
  });

  it('is not fresh when the hospital has no cached metadata at all', async () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    expect(isAssessmentMetadataCacheFresh(null, 60_000, now)).toBe(false);
  });

  it('follows the OLDEST row — one stale row makes the whole cache stale', async () => {
    const now = new Date('2026-11-19T10:00:00.000Z');
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, ITEMS, now);
    // One form version was written long ago and never rewritten. The newest
    // row must not make it look fresh (MAX would).
    await db.execute(
      `UPDATE cached_assessment_form_metadata
          SET synced_at = ?
        WHERE hospital_id = ? AND form_id = 205`,
      [new Date(now.getTime() - 10 * 60 * 60 * 1000).toISOString(), HOSPITAL_ID],
    );

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    expect(cached.syncedAt).not.toBeNull();
    expect(isAssessmentMetadataCacheFresh(cached.syncedAt, 60 * 60 * 1000, now)).toBe(false);
    expect(isAssessmentMetadataCacheFresh(cached.syncedAt, 24 * 60 * 60 * 1000, now)).toBe(true);
  });

  it('forgets a form version the site deleted', async () => {
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, FORMS, ITEMS);
    // The site deleted the older version — HOSxP no longer reports it, so
    // the cache must not keep it (it would win newestFormIdByTable).
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, [FORMS[0]], [ITEMS[0], ITEMS[1]]);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    expect(cached.forms.map((f) => f.assessment_form_id)).toEqual([309]);
    expect(cached.items.filter((i) => Number(i.assessment_form_id) === 205)).toHaveLength(0);
  });

  it('writes the whole set or nothing — a refused row rolls the write back', async () => {
    // A form table longer than the column (VARCHAR(64)) is refused by the
    // database. The rows written before it must not survive.
    const tooLong = {
      assessment_form_id: 999,
      assessment_form_table: 'x'.repeat(100),
      assessment_form_name: 'too long',
    };

    await expect(
      writeAssessmentMetadataCache(db, HOSPITAL_ID, [FORMS[0], tooLong], ITEMS),
    ).rejects.toThrow();

    const rows = await db.query<{ id: string }>(
      'SELECT id FROM cached_assessment_form_metadata WHERE hospital_id = ?',
      [HOSPITAL_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it('writes nothing when there is no form to learn from', async () => {
    // An empty metadata read is "nothing learned" — the cache must not be
    // marked fresh (not even with sentinels).
    await writeAssessmentMetadataCache(db, HOSPITAL_ID, [], [], new Date());

    const rows = await db.query<{ id: string }>(
      'SELECT id FROM cached_assessment_form_metadata WHERE hospital_id = ?',
      [HOSPITAL_ID],
    );
    expect(rows).toHaveLength(0);
  });

  it('keeps a real form whose id is 0 — the sentinel marker cannot collide', async () => {
    const zeroForm = {
      assessment_form_id: 0,
      assessment_form_table: 'asm_lr_record_after_birth_nan',
      assessment_form_name: 'zero id',
    };

    await writeAssessmentMetadataCache(db, HOSPITAL_ID, [zeroForm], [
      { ...ITEMS[0], assessment_form_id: 0 },
    ]);

    const cached = await readAssessmentMetadataCache(db, HOSPITAL_ID);

    expect(cached.forms.map((f) => f.assessment_form_id)).toContain(0);
    expect(cached.items.filter((i) => Number(i.assessment_form_id) === 0)).toHaveLength(1);
    expect(UNUSED_FORM_ID).toBeLessThan(0);
  });

  it('has the unique index the upsert relies on', async () => {
    // SchemaSync swallows a failed CREATE INDEX — the cache would silently
    // never upsert. The index has to be there, with its three columns.
    const rows = await db.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'cached_assessment_form_metadata'
          AND indexname = 'uniq_cafm_hospital_form_version'`,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toMatch(/UNIQUE/i);
    expect(rows[0].indexdef).toContain('hospital_id');
    expect(rows[0].indexdef).toContain('form_table');
    expect(rows[0].indexdef).toContain('form_id');
  });
});
