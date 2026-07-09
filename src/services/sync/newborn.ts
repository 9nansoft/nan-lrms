// Newborn sync — HOSxP labour_infant rows → cached_newborns + journey transition
import type { DatabaseAdapter } from '@/db/adapter';
import type { HosxpLabourInfantRow, HosxpIptPregnancyRow } from '@/types/hosxp';
import { upsertNewborn } from '@/services/newborn';
import { transitionToDelivered } from '@/services/journey';

export async function syncNewbornData(
  db: DatabaseAdapter,
  journeyId: string,
  infantRows: HosxpLabourInfantRow[],
): Promise<number> {
  let count = 0;

  for (const infant of infantRows) {
    const bornAt =
      infant.birth_date && infant.birth_time
        ? `${infant.birth_date}T${infant.birth_time}`
        : (infant.birth_date ?? new Date().toISOString());

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

interface BirthResolutionItem {
  an: string;
  motherHn: string | null;
  bornMs: number;
}

/**
 * Resolve mothers' ANs to journey IDs: cached_patients (hospital + AN)
 * first, then the mother's HN against maternal_journeys — for repeat
 * mothers, the pregnancy registered most recently BEFORE the birth wins.
 * Shared by the labour-infant batch and the ipt_pregnancy fallback.
 */
async function resolveJourneysForBirths(
  db: DatabaseAdapter,
  hospitalId: string,
  items: BirthResolutionItem[],
): Promise<Map<string, string>> {
  const journeyByAn = new Map<string, string>();
  if (items.length === 0) return journeyByAn;

  const ans = items.map((i) => i.an);
  const placeholders = ans.map(() => '?').join(',');
  const patientRows = await db.query<{ an: string; journey_id: string | null }>(
    `SELECT an, journey_id FROM cached_patients
      WHERE hospital_id = ? AND an IN (${placeholders})`,
    [hospitalId, ...ans],
  );
  for (const p of patientRows) {
    if (p.journey_id) journeyByAn.set(p.an, p.journey_id);
  }

  const unresolved = items.filter(
    (i): i is BirthResolutionItem & { motherHn: string } =>
      !journeyByAn.has(i.an) && i.motherHn !== null,
  );
  if (unresolved.length === 0) return journeyByAn;

  const hns = Array.from(new Set(unresolved.map((u) => u.motherHn)));
  const hnPlaceholders = hns.map(() => '?').join(',');
  const journeyRows = await db.query<{ id: string; hn: string; registered_at: string }>(
    `SELECT id, hn, registered_at FROM maternal_journeys
      WHERE hospital_id = ? AND hn IN (${hnPlaceholders})`,
    [hospitalId, ...hns],
  );
  const journeysByHn = new Map<string, Array<{ id: string; regMs: number }>>();
  for (const j of journeyRows) {
    const list = journeysByHn.get(j.hn) ?? [];
    list.push({ id: j.id, regMs: new Date(j.registered_at).getTime() });
    journeysByHn.set(j.hn, list);
  }
  for (const list of journeysByHn.values()) list.sort((a, b) => a.regMs - b.regMs);

  for (const u of unresolved) {
    const candidates = journeysByHn.get(u.motherHn);
    if (!candidates || candidates.length === 0) continue;
    const before = candidates.filter((c) => c.regMs <= u.bornMs);
    const pick = before.length > 0 ? before[before.length - 1] : candidates[0];
    journeyByAn.set(u.an, pick.id);
  }
  return journeyByAn;
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

  const journeyByAn = await resolveJourneysForBirths(
    db,
    hospitalId,
    Array.from(byAn.entries()).map(([an, list]) => ({
      an,
      motherHn: list[0].mother_hn ? String(list[0].mother_hn) : null,
      bornMs: list[0].birth_date ? new Date(list[0].birth_date).getTime() : Number.MAX_SAFE_INTEGER,
    })),
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

// ─── ipt_pregnancy fallback ─────────────────────────────────────────────────
// HOSxP's own Account 2 module closes pregnancies from ipt_pregnancy (the
// per-admission delivery summary), not from ipt_labour_infant — some sites
// only ever fill the former. The fallback synthesizes minimal newborn rows
// (infant 1..child_count, bornAt = labor_date, no sex/weight/Apgar) so births
// are counted and journeys transition; if detailed infant rows arrive later
// they overwrite these via the (journey_id, infant_number) upsert key.

/** Sanity cap on synthesized infants per delivery — guards against garbage
 *  child_count values (quintuplets are the largest plausible multiple). */
const MAX_SYNTHESIZED_INFANTS = 5;

export interface PregnancyFallbackResult extends NewbornSyncResult {
  /** Journeys skipped because detailed infant rows already exist. */
  skippedHasDetail: number;
}

export async function syncNewbornsFromPregnancyRows(
  db: DatabaseAdapter,
  hospitalId: string,
  rows: HosxpIptPregnancyRow[],
): Promise<PregnancyFallbackResult> {
  const result: PregnancyFallbackResult = {
    rowsRead: rows.length,
    upserted: 0,
    journeys: 0,
    skippedNoJourney: 0,
    skippedHasDetail: 0,
  };

  // an is ipt_pregnancy's PK, but dedupe defensively; undelivered admissions
  // (labor_date NULL) carry no outcome yet.
  const byAn = new Map<string, HosxpIptPregnancyRow>();
  for (const row of rows) {
    if (row.labor_date == null) continue;
    byAn.set(String(row.an), row);
  }
  if (byAn.size === 0) return result;

  const journeyByAn = await resolveJourneysForBirths(
    db,
    hospitalId,
    Array.from(byAn.entries()).map(([an, row]) => ({
      an,
      motherHn: row.mother_hn ? String(row.mother_hn) : null,
      bornMs: new Date(row.labor_date as string).getTime() || Number.MAX_SAFE_INTEGER,
    })),
  );

  for (const [an, row] of byAn) {
    const journeyId = journeyByAn.get(an);
    if (!journeyId) {
      result.skippedNoJourney += 1;
      continue;
    }

    // Never clobber richer per-infant data (from the labour module or an
    // earlier cycle) with weight-less synthesized rows.
    const existing = await db.query<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM cached_newborns WHERE journey_id = ?`,
      [journeyId],
    );
    if (Number(existing[0]?.cnt) > 0) {
      result.skippedHasDetail += 1;
      continue;
    }

    const live = Math.min(Math.max(Number(row.child_count) || 0, 0), MAX_SYNTHESIZED_INFANTS);
    const dead = Number(row.dead_child_count) || 0;
    // A delivery happened only if some outcome was recorded — an admission
    // with labor_date but zero counts stays open for the detailed source.
    if (live === 0 && dead === 0) continue;

    for (let i = 1; i <= live; i++) {
      await upsertNewborn(db, {
        journeyId,
        infantNumber: i,
        bornAt: row.labor_date as string,
        resuscitation: {},
        vaccinations: {},
      });
      result.upserted += 1;
    }
    await transitionToDelivered(db, journeyId);
    result.journeys += 1;
  }

  return result;
}

// ─── Browser-push glue ──────────────────────────────────────────────────────
// Production syncs through the browser gateway (server-side polling is
// disabled), so /api/sync/browser-push needs one entry point that runs raw
// gateway rows through BOTH sources: detailed labour infants first, then the
// ipt_pregnancy summary fallback (which skips journeys the first pass filled).

export interface BrowserNewbornsSection {
  infants?: unknown;
  pregnancies?: unknown;
}

export interface BrowserNewbornsResult {
  infants: NewbornSyncResult;
  fallback: PregnancyFallbackResult;
}

export async function processBrowserNewborns(
  db: DatabaseAdapter,
  hospitalId: string,
  section: BrowserNewbornsSection,
): Promise<BrowserNewbornsResult> {
  const infantRows = Array.isArray(section.infants)
    ? (section.infants as HosxpLabourInfantRow[])
    : [];
  const pregnancyRows = Array.isArray(section.pregnancies)
    ? (section.pregnancies as HosxpIptPregnancyRow[])
    : [];
  const infants = await syncNewbornsFromRows(db, hospitalId, infantRows);
  const fallback = await syncNewbornsFromPregnancyRows(db, hospitalId, pregnancyRows);
  return { infants, fallback };
}
