// Newborn polling-sync glue — TDD for wiring syncNewbornData into the cycle.
// Covers the AN→journey resolution via cached_patients, idempotent re-runs,
// and the self-healing cutoff-date window.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '@/db/sqlite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables';
import {
  syncNewbornsFromRows,
  syncNewbornsFromPregnancyRows,
  newbornSyncCutoffDate,
} from '@/services/sync/newborn';
import type { HosxpLabourInfantRow, HosxpIptPregnancyRow } from '@/types/hosxp';

const HOSPITAL_ID = 'hosp-001';
const JOURNEY_ID = 'journey-001';

function makeInfantRow(
  an: string,
  infantNumber: number,
  overrides: Partial<HosxpLabourInfantRow> = {},
): HosxpLabourInfantRow {
  return {
    ipt_labour_infant_id: infantNumber,
    ipt_labour_id: 1,
    an,
    infant_number: infantNumber,
    sex: 'F',
    birth_weight: 3200,
    body_length: 50,
    head_length: 34,
    temperature: 36.8,
    rr: 45,
    hr: 130,
    apgar_score_min1: 8,
    apgar_score_min5: 9,
    apgar_score_min10: 10,
    infant_check_ppv: 'N',
    infant_check_et_tube: 'N',
    infant_check_chest_pump: 'N',
    infant_check_oxygen_box: 'N',
    infant_check_narcan: 'N',
    infant_check_feed_milk: 'Y',
    infant_check_vitk: 'Y',
    infant_check_eyepaste: 'Y',
    infant_check_bcg: 'Y',
    infant_check_hepb: 'Y',
    infant_check_azt: 'N',
    infant_icd10: null,
    infant_hn: `NB-${an}-${infantNumber}`,
    infant_an: null,
    infant_dchstts: null,
    birth_date: '2026-07-01',
    birth_time: '10:30:00',
    ...overrides,
  };
}

describe('newborn polling sync', () => {
  let db: SqliteAdapter;

  beforeEach(async () => {
    db = new SqliteAdapter(':memory:');
    await SchemaSync.sync(db, ALL_TABLES, 'sqlite');
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, '10670', 'รพ.ขอนแก่น', 'A_S', 1, 'ONLINE', ?, ?)`,
      [HOSPITAL_ID, now, now],
    );
    await db.execute(
      `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, anc_risk_level, anc_visit_count, registered_at, stage_changed_at, synced_at, created_at, updated_at)
       VALUES (?, ?, ?, 'HN001', 'Test Mother', 'enc_cid', 'cidhash_x', 28, 1, 0, 'LABOR', 'LOW', 5, ?, ?, ?, ?, ?)`,
      [JOURNEY_ID, HOSPITAL_ID, HOSPITAL_ID, now, now, now, now, now],
    );
    await db.execute(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, age, admit_date, labor_status, journey_id, synced_at, created_at, updated_at)
       VALUES ('pat-1', ?, 'HN001', 'AN001', 'enc-name', 28, ?, 'ACTIVE', ?, ?, ?, ?)`,
      [HOSPITAL_ID, now, JOURNEY_ID, now, now, now],
    );
  });

  afterEach(async () => {
    await db.close();
  });

  it('upserts infants grouped by AN, resolves journeys via cached_patients, transitions the journey', async () => {
    const rows = [
      makeInfantRow('AN001', 1),
      makeInfantRow('AN001', 2, { birth_weight: 2400 }),
      makeInfantRow('AN-UNKNOWN', 1),
    ];

    const result = await syncNewbornsFromRows(db, HOSPITAL_ID, rows);

    expect(result).toEqual({ rowsRead: 3, upserted: 2, journeys: 1, skippedNoJourney: 1 });

    const newborns = await db.query<{ infant_number: number }>(
      `SELECT infant_number FROM cached_newborns WHERE journey_id = ? ORDER BY infant_number`,
      [JOURNEY_ID],
    );
    expect(newborns.map((n) => n.infant_number)).toEqual([1, 2]);

    const journey = await db.query<{ care_stage: string }>(
      `SELECT care_stage FROM maternal_journeys WHERE id = ?`,
      [JOURNEY_ID],
    );
    expect(journey[0].care_stage).toBe('DELIVERED');
  });

  it('is idempotent — re-running the same rows updates instead of duplicating', async () => {
    const rows = [makeInfantRow('AN001', 1)];
    await syncNewbornsFromRows(db, HOSPITAL_ID, rows);
    await syncNewbornsFromRows(db, HOSPITAL_ID, rows);

    const count = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM cached_newborns WHERE journey_id = ?`,
      [JOURNEY_ID],
    );
    expect(Number(count[0].cnt)).toBe(1);
  });

  it('falls back to the mother HN when the AN was never cached (backfill path)', async () => {
    // No cached_patients row for AN-OLD — the admission predates the system.
    // The infant row carries the mother's HN from HOSxP (ipt join), which
    // resolves to the journey directly.
    const rows = [makeInfantRow('AN-OLD', 1, { mother_hn: 'HN001' })];

    const result = await syncNewbornsFromRows(db, HOSPITAL_ID, rows);

    expect(result.upserted).toBe(1);
    expect(result.skippedNoJourney).toBe(0);
    const newborns = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM cached_newborns WHERE journey_id = ?`,
      [JOURNEY_ID],
    );
    expect(Number(newborns[0].cnt)).toBe(1);
  });

  it('for repeat mothers, attributes the birth to the pregnancy registered before it', async () => {
    const now = Date.now();
    const iso = (d: number) => new Date(now - d * 24 * 3600_000).toISOString();
    // Same HN, two pregnancies: an old delivered journey and the current one.
    await db.execute(
      `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, anc_risk_level, anc_visit_count, registered_at, stage_changed_at, synced_at, created_at, updated_at)
       VALUES ('journey-old', ?, ?, 'HN002', 'Repeat Mother', 'enc_cid2', 'cidhash_y', 32, 2, 1, 'DELIVERED', 'LOW', 5, ?, ?, ?, ?, ?)`,
      [HOSPITAL_ID, HOSPITAL_ID, iso(400), iso(400), iso(400), iso(400), iso(400)],
    );
    await db.execute(
      `INSERT INTO maternal_journeys (id, hospital_id, current_hospital_id, hn, name, cid, cid_hash, age, gravida, para, care_stage, anc_risk_level, anc_visit_count, registered_at, stage_changed_at, synced_at, created_at, updated_at)
       VALUES ('journey-new', ?, ?, 'HN002', 'Repeat Mother', 'enc_cid2', 'cidhash_y', 32, 3, 2, 'LABOR', 'LOW', 5, ?, ?, ?, ?, ?)`,
      [HOSPITAL_ID, HOSPITAL_ID, iso(200), iso(200), iso(200), iso(200), iso(200)],
    );

    const birthDate = new Date(now - 5 * 24 * 3600_000).toISOString().slice(0, 10);
    await syncNewbornsFromRows(db, HOSPITAL_ID, [
      makeInfantRow('AN-REPEAT', 1, { mother_hn: 'HN002', birth_date: birthDate }),
    ]);

    const newborns = await db.query<{ journey_id: string }>(
      `SELECT journey_id FROM cached_newborns WHERE infant_hn = 'NB-AN-REPEAT-1'`,
    );
    expect(newborns[0].journey_id).toBe('journey-new');
  });

  // ── ipt_pregnancy fallback ─────────────────────────────────────────────
  // Some sites fill the IPD pregnancy summary (ipt_pregnancy) but never the
  // labour-module infant table — the fallback synthesizes minimal newborn
  // rows from the delivery summary so births are counted and journeys close.

  function makePregnancyRow(
    an: string,
    overrides: Partial<HosxpIptPregnancyRow> = {},
  ): HosxpIptPregnancyRow {
    return {
      an,
      mother_hn: null,
      labor_date: '2026-07-01',
      child_count: 1,
      dead_child_count: 0,
      preg_number: 1,
      ga: 39,
      ...overrides,
    };
  }

  it('fallback: synthesizes one newborn per live child and transitions the journey', async () => {
    const result = await syncNewbornsFromPregnancyRows(db, HOSPITAL_ID, [
      makePregnancyRow('AN001', { child_count: 2 }),
      makePregnancyRow('AN-UNKNOWN'),
    ]);

    expect(result).toEqual({
      rowsRead: 2,
      upserted: 2,
      journeys: 1,
      skippedNoJourney: 1,
      skippedHasDetail: 0,
    });

    const newborns = await db.query<{ infant_number: number; born_at: string }>(
      `SELECT infant_number, born_at FROM cached_newborns WHERE journey_id = ? ORDER BY infant_number`,
      [JOURNEY_ID],
    );
    expect(newborns.map((n) => n.infant_number)).toEqual([1, 2]);
    expect(newborns[0].born_at.slice(0, 10)).toBe('2026-07-01');

    const journey = await db.query<{ care_stage: string }>(
      `SELECT care_stage FROM maternal_journeys WHERE id = ?`,
      [JOURNEY_ID],
    );
    expect(journey[0].care_stage).toBe('DELIVERED');
  });

  it('fallback: never clobbers journeys that already have detailed infant rows', async () => {
    await syncNewbornsFromRows(db, HOSPITAL_ID, [makeInfantRow('AN001', 1)]);

    const result = await syncNewbornsFromPregnancyRows(db, HOSPITAL_ID, [
      makePregnancyRow('AN001', { child_count: 3 }),
    ]);

    expect(result.upserted).toBe(0);
    expect(result.skippedHasDetail).toBe(1);
    const newborns = await db.query<{ birth_weight_g: number | null }>(
      `SELECT birth_weight_g FROM cached_newborns WHERE journey_id = ?`,
      [JOURNEY_ID],
    );
    expect(newborns).toHaveLength(1);
    expect(Number(newborns[0].birth_weight_g)).toBe(3200); // detail row untouched
  });

  it('fallback: resolves via mother HN when the AN was never cached', async () => {
    const result = await syncNewbornsFromPregnancyRows(db, HOSPITAL_ID, [
      makePregnancyRow('AN-OLD', { mother_hn: 'HN001' }),
    ]);

    expect(result.upserted).toBe(1);
    expect(result.skippedNoJourney).toBe(0);
  });

  it('fallback: stillbirth-only delivery closes the journey without newborn rows', async () => {
    const result = await syncNewbornsFromPregnancyRows(db, HOSPITAL_ID, [
      makePregnancyRow('AN001', { child_count: 0, dead_child_count: 1 }),
    ]);

    expect(result.upserted).toBe(0);
    expect(result.journeys).toBe(1);
    const journey = await db.query<{ care_stage: string }>(
      `SELECT care_stage FROM maternal_journeys WHERE id = ?`,
      [JOURNEY_ID],
    );
    expect(journey[0].care_stage).toBe('DELIVERED');
  });

  it('fallback: skips undelivered rows and caps garbage child counts', async () => {
    const result = await syncNewbornsFromPregnancyRows(db, HOSPITAL_ID, [
      makePregnancyRow('AN001', { child_count: 99 }),
      makePregnancyRow('AN-PENDING', { labor_date: null }),
    ]);

    expect(result.rowsRead).toBe(2);
    const newborns = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM cached_newborns WHERE journey_id = ?`,
      [JOURNEY_ID],
    );
    expect(Number(newborns[0].cnt)).toBeLessThanOrEqual(5);
  });

  it('cutoff: 365-day backfill window when nothing is cached for the hospital', async () => {
    const now = new Date('2026-07-09T12:00:00+07:00');
    const cutoff = await newbornSyncCutoffDate(db, HOSPITAL_ID, now);
    expect(cutoff).toBe('2025-07-09');
  });

  it('cutoff: two days before the latest cached birth once data exists', async () => {
    await syncNewbornsFromRows(db, HOSPITAL_ID, [
      makeInfantRow('AN001', 1, { birth_date: '2026-07-01' }),
    ]);

    const cutoff = await newbornSyncCutoffDate(db, HOSPITAL_ID, new Date('2026-07-09T12:00:00Z'));
    expect(cutoff).toBe('2026-06-29');
  });
});
