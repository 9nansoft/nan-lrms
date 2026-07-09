// Newborn sync — HOSxP labour_infant rows → cached_newborns + journey transition
import type { DatabaseAdapter } from '@/db/adapter';
import type { HosxpLabourInfantRow } from '@/types/hosxp';
import { upsertNewborn } from '@/services/newborn';
import { transitionToDelivered } from '@/services/journey';

export async function syncNewbornData(
  db: DatabaseAdapter,
  journeyId: string,
  infantRows: HosxpLabourInfantRow[],
): Promise<number> {
  let count = 0;

  for (const infant of infantRows) {
    const bornAt = infant.birth_date && infant.birth_time
      ? `${infant.birth_date}T${infant.birth_time}`
      : infant.birth_date ?? new Date().toISOString();

    await upsertNewborn(db, {
      journeyId,
      infantNumber: infant.infant_number,
      sex: infant.sex ?? undefined,
      birthWeightG: infant.birth_weight ?? undefined,
      bodyLengthCm: infant.body_length ?? undefined,
      headCircumCm: infant.head_length ?? undefined,
      temperature: infant.temperature ?? undefined,
      heartRate: infant.hr ?? undefined,
      respiratoryRate: infant.rr ?? undefined,
      apgar1min: infant.apgar_score_min1 ?? undefined,
      apgar5min: infant.apgar_score_min5 ?? undefined,
      apgar10min: infant.apgar_score_min10 ?? undefined,
      resuscitation: {
        ppv: infant.infant_check_ppv === 'Y',
        et_tube: infant.infant_check_et_tube === 'Y',
        chest_pump: infant.infant_check_chest_pump === 'Y',
        oxygen_box: infant.infant_check_oxygen_box === 'Y',
        narcan: infant.infant_check_narcan === 'Y',
      },
      vaccinations: {
        bcg: infant.infant_check_bcg === 'Y',
        hepb: infant.infant_check_hepb === 'Y',
        vitk: infant.infant_check_vitk === 'Y',
        eye_paste: infant.infant_check_eyepaste === 'Y',
        azt: infant.infant_check_azt === 'Y',
      },
      infantIcd10: infant.infant_icd10 ?? undefined,
      infantHn: infant.infant_hn ?? undefined,
      infantAn: infant.infant_an ?? undefined,
      dischargeStatus: infant.infant_dchstts ?? undefined,
      bornAt,
    });
    count++;
  }

  if (infantRows.length > 0) {
    await transitionToDelivered(db, journeyId);
  }

  return count;
}

// ─── Polling-cycle glue ─────────────────────────────────────────────────────
// The per-journey syncNewbornData above predates the polling integration; the
// helpers below let the cycle fetch one LABOUR_INFANTS_SINCE batch per
// hospital and fan it out to journeys via cached_patients.an → journey_id.

/** First backfill window when a hospital has no cached newborns yet. */
const BACKFILL_LOOKBACK_DAYS = 365;
/** Re-read overlap so late edits to recent births are picked up. */
const REFRESH_OVERLAP_DAYS = 2;
const DAY_MS = 24 * 3600_000;

export interface NewbornSyncResult {
  rowsRead: number;
  upserted: number;
  journeys: number;
  skippedNoJourney: number;
}

/**
 * Self-healing HOSxP query cutoff (YYYY-MM-DD): two days before the latest
 * cached birth for this hospital, or a one-year backfill window when nothing
 * is cached yet. Idempotent upserts make the overlap safe.
 */
export async function newbornSyncCutoffDate(
  db: DatabaseAdapter,
  hospitalId: string,
  now: Date = new Date(),
): Promise<string> {
  const rows = await db.query<{ max_born: string | null }>(
    `SELECT MAX(cn.born_at) as max_born
       FROM cached_newborns cn
       JOIN maternal_journeys mj ON mj.id = cn.journey_id
      WHERE mj.hospital_id = ?`,
    [hospitalId],
  );
  const maxBorn = rows[0]?.max_born;
  const baseMs = maxBorn
    ? new Date(maxBorn).getTime() - REFRESH_OVERLAP_DAYS * DAY_MS
    : now.getTime() - BACKFILL_LOOKBACK_DAYS * DAY_MS;
  return new Date(baseMs).toISOString().slice(0, 10);
}

/**
 * Fan a LABOUR_INFANTS_SINCE batch out to journeys. Rows group by the
 * mother's AN; the journey resolves through cached_patients (hospital + AN).
 * ANs the system never admitted are counted and skipped — they cannot be
 * attributed to a pregnancy journey.
 */
export async function syncNewbornsFromRows(
  db: DatabaseAdapter,
  hospitalId: string,
  rows: HosxpLabourInfantRow[],
): Promise<NewbornSyncResult> {
  const result: NewbornSyncResult = {
    rowsRead: rows.length,
    upserted: 0,
    journeys: 0,
    skippedNoJourney: 0,
  };
  if (rows.length === 0) return result;

  const byAn = new Map<string, HosxpLabourInfantRow[]>();
  for (const row of rows) {
    const an = String(row.an);
    const list = byAn.get(an) ?? [];
    list.push(row);
    byAn.set(an, list);
  }

  const ans = Array.from(byAn.keys());
  const placeholders = ans.map(() => '?').join(',');
  const patientRows = await db.query<{ an: string; journey_id: string | null }>(
    `SELECT an, journey_id FROM cached_patients
      WHERE hospital_id = ? AND an IN (${placeholders})`,
    [hospitalId, ...ans],
  );
  const journeyByAn = new Map(
    patientRows.filter((p) => p.journey_id).map((p) => [p.an, p.journey_id as string]),
  );

  for (const [an, infantRows] of byAn) {
    const journeyId = journeyByAn.get(an);
    if (!journeyId) {
      result.skippedNoJourney += 1;
      continue;
    }
    result.upserted += await syncNewbornData(db, journeyId, infantRows);
    result.journeys += 1;
  }

  return result;
}
