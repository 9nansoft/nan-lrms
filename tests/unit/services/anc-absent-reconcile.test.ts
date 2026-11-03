// ANC absent-pregnancy reconciliation.
//
// รพ.หนองสองห้อง (11007), 2026-10-28: ten women who had delivered, completed
// postpartum follow-up and been discharged in HOSxP (person_anc.discharge='Y')
// stayed on the NN-LRMS pregnancy board indefinitely. The ANC ingest is
// upsert-only — when HOSxP stops listing a woman nothing closes her journey —
// and the board's freshness gates (EDC / last ANC / GA) all pass on NULL, so a
// row with no dates never expires. The labour feed already solves the same
// problem with an authoritative active-AN set (activeAns); this is the ANC
// counterpart, keyed on the CID hashes HOSxP returned this cycle.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  createJourney,
  closeAbsentAncJourneys,
  reopenReconciledJourney,
  transitionToDelivered,
} from '@/services/journey';
import { ANC_ABSENT_CLOSE_GRACE_DAYS, ANC_ABSENT_CLOSED_REASON } from '@/config/anc-freshness';
import { AncRiskLevel, CareStage } from '@/types/domain';

const H = 'hosp-nss';
const OTHER = 'hosp-other';
const DAY_MS = 86_400_000;
const NOW = new Date('2026-10-28T07:00:00.000Z');

function hash(n: number): string {
  return n.toString(16).padStart(64, '0');
}

async function seedHospitals(db: DatabaseAdapter): Promise<void> {
  for (const [id, hcode] of [
    [H, '11007'],
    [OTHER, '11004'],
  ]) {
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, ?, ?, 'S', TRUE, 'ONLINE', NOW(), NOW())`,
      [id, hcode, hcode],
    );
  }
}

/** A PREGNANCY journey last refreshed by a sync `daysAgo` days before NOW. */
async function journey(
  db: DatabaseAdapter,
  n: number,
  daysAgo: number,
  hospitalId = H,
): Promise<string> {
  const j = await createJourney(db, {
    hospitalId,
    hn: `HN${n}`,
    personAncId: null,
    name: 'enc',
    cid: 'enc',
    cidHash: hash(n),
    age: 25,
    gravida: 1,
    para: 0,
    lmp: null,
    edc: null,
    ancRiskLevel: AncRiskLevel.LOW,
  });
  const seen = new Date(NOW.getTime() - daysAgo * DAY_MS).toISOString();
  await db.execute('UPDATE maternal_journeys SET synced_at = ?, updated_at = ? WHERE id = ?', [
    seen,
    seen,
    j.id,
  ]);
  return j.id;
}

async function row(db: DatabaseAdapter, id: string) {
  const rows = await db.query<{
    care_stage: string;
    closed_reason: string | null;
    stage_changed_at: string | Date;
  }>('SELECT care_stage, closed_reason, stage_changed_at FROM maternal_journeys WHERE id = ?', [
    id,
  ]);
  return rows[0];
}

describe('closeAbsentAncJourneys', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
    await seedHospitals(db);
  });

  afterEach(() => {
    db.close();
  });

  const run = (activeCidHashes: string[]) =>
    closeAbsentAncJourneys(db, { hospitalId: H, activeCidHashes, now: NOW });

  it('closes a pregnancy HOSxP stopped listing, stamped with when she was last seen', async () => {
    const gone = await journey(db, 1, 8);

    expect(await run([])).toBe(1);

    const r = await row(db, gone);
    expect(r.care_stage).toBe(CareStage.DELIVERED);
    expect(r.closed_reason).toBe(ANC_ABSENT_CLOSED_REASON);
    // Last-seen, not now: closing a stale backlog must not read as a burst of
    // stage changes today.
    expect(new Date(r.stage_changed_at).toISOString()).toBe(
      new Date(NOW.getTime() - 8 * DAY_MS).toISOString(),
    );
  });

  it('keeps a woman HOSxP still lists, however long since her journey was refreshed', async () => {
    const listed = await journey(db, 2, 30);
    expect(await run([hash(2)])).toBe(0);
    expect((await row(db, listed)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it('waits out the grace period before closing an absent pregnancy', async () => {
    const recent = await journey(db, 3, ANC_ABSENT_CLOSE_GRACE_DAYS - 1);
    expect(await run([])).toBe(0);
    expect((await row(db, recent)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it("never touches another hospital's pregnancies", async () => {
    const elsewhere = await journey(db, 4, 30, OTHER);
    expect(await run([])).toBe(0);
    expect((await row(db, elsewhere)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it('leaves a woman referred to another hospital to that hospital', async () => {
    // Registered here, now cared for elsewhere: this hospital's ANC list is no
    // longer the authority on whether her pregnancy is still running.
    const referred = await journey(db, 5, 30);
    await db.execute('UPDATE maternal_journeys SET current_hospital_id = ? WHERE id = ?', [
      OTHER,
      referred,
    ]);
    expect(await run([])).toBe(0);
    expect((await row(db, referred)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it('never closes a woman who is on a labour ward right now', async () => {
    const inLabour = await journey(db, 6, 30);
    const now = NOW.toISOString();
    await db.execute(
      `INSERT INTO cached_patients (id, hospital_id, hn, an, name, cid_hash, age, admit_date, labor_status, synced_at, created_at, updated_at)
       VALUES ('cp-6', ?, 'HN6', 'AN6', 'enc', ?, 25, ?, 'ACTIVE', ?, ?, ?)`,
      [OTHER, hash(6), now, now, now, now],
    );
    expect(await run([])).toBe(0);
    expect((await row(db, inLabour)).care_stage).toBe(CareStage.PREGNANCY);
  });

  it('closes absent journeys that carry no CID hash at all', async () => {
    const noCid = await journey(db, 7, 30);
    await db.execute("UPDATE maternal_journeys SET cid_hash = '' WHERE id = ?", [noCid]);
    expect(await run([hash(99)])).toBe(1);
  });
});

describe('reopenReconciledJourney', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
    await seedHospitals(db);
  });

  afterEach(() => {
    db.close();
  });

  it('puts a reconciliation-closed pregnancy back on the board when HOSxP lists her again', async () => {
    const id = await journey(db, 50, 30);
    await closeAbsentAncJourneys(db, { hospitalId: H, activeCidHashes: [], now: NOW });

    expect(await reopenReconciledJourney(db, id)).toBe(true);

    const r = await row(db, id);
    expect(r.care_stage).toBe(CareStage.PREGNANCY);
    expect(r.closed_reason).toBeNull();
  });

  it('never reopens a pregnancy that ended in a recorded delivery', async () => {
    const id = await journey(db, 51, 0);
    await transitionToDelivered(db, id);
    expect(await reopenReconciledJourney(db, id)).toBe(false);
    expect((await row(db, id)).care_stage).toBe(CareStage.DELIVERED);
  });
});
