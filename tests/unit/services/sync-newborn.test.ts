// Newborn polling-sync glue — TDD for wiring syncNewbornData into the cycle.
// Covers the AN→journey resolution via cached_patients, idempotent re-runs,
// and the self-healing cutoff-date window.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '@/db/sqlite-adapter';
import { SchemaSync } from '@/db/schema-sync';
import { ALL_TABLES } from '@/db/tables';
import { syncNewbornsFromRows, newbornSyncCutoffDate } from '@/services/sync/newborn';
import type { HosxpLabourInfantRow } from '@/types/hosxp';

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
