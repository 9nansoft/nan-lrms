/**
 * Persists HOSxP ANC lab rows and keeps the columns derived from them current.
 *
 * Labs never touch risk levels, screening rows or alerts: acting on a positive
 * result needs obstetric sign-off. Only upserts happen here, so a partial pull
 * can never remove data. Logs carry counts and ids, never names or results.
 */
import { createHmac } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import type { DatabaseAdapter } from '@/db/adapter';
import {
  ANC_LAB_RH_FORM_WORD_NOTE,
  ANC_LAB_STICKY_POSITIVE_TESTS,
  ANC_LAB_TESTS,
  type AncLabSource,
  type AncLabTest,
} from '@/config/anc-lab-canon';
import { ReferralStatus } from '@/types/domain';
import { encrypt } from '@/lib/encryption';
import { toIsoDate } from '@/lib/dates';
import { isPlausibleEventDate, normalizeHosxpDate } from '@/lib/hosxp-date';
import {
  classifyAncLab,
  type AncLabClassification,
  type AncLabPayloadRow,
} from '@/services/anc-lab-classifier';

export const ANC_LAB_MAX_ROWS_PER_PATIENT = 400;
const MAX_SOURCE_ID_LENGTH = 140;
const MAX_TEXT_LENGTH = 2000;
const MAX_GA_WEEKS = 60;

type LabWriter = Pick<DatabaseAdapter, 'execute'>;
type LabReader = Pick<DatabaseAdapter, 'query'>;

export interface AncLabIngestStats {
  received: number;
  upserted: number;
  unchanged: number;
  /** Rows rejected at the boundary or over the per-patient cap. */
  skipped: number;
  unclassified: number;
  concealed: number;
}

export function emptyAncLabStats(): AncLabIngestStats {
  return { received: 0, upserted: 0, unchanged: 0, skipped: 0, unclassified: 0, concealed: 0 };
}

const SOURCES: readonly AncLabSource[] = ['anc_lab', 'lab_order', 'person_anc'];
const TEXT_FIELDS = [
  'resultDate',
  'ancLabName',
  'labItemsName',
  'labItemsCode',
  'result',
  'unit',
  'normalReference',
  'abnormalFlag',
  'ancResultNormalRaw',
] as const;

// Postgres text cannot hold a NUL byte and rejects the statement if one arrives.
const hasNul = (value: string): boolean => value.includes('\u0000');

function isValidText(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.length <= MAX_TEXT_LENGTH && !hasNul(value))
  );
}

function isValidRow(row: unknown): row is AncLabPayloadRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  if (!SOURCES.includes(r.source as AncLabSource)) return false;
  if (typeof r.sourceId !== 'string' || r.sourceId.length === 0) return false;
  if (r.sourceId.length > MAX_SOURCE_ID_LENGTH || hasNul(r.sourceId)) return false;
  return TEXT_FIELDS.every((field) => isValidText(r[field]));
}

/** The push boundary: bad rows are dropped and counted, never fatal. */
export function sanitizeAncLabRows(value: unknown): {
  rows: AncLabPayloadRow[];
  skipped: number;
} {
  if (value === undefined || value === null) return { rows: [], skipped: 0 };
  if (!Array.isArray(value)) return { rows: [], skipped: 1 };
  const valid = value.filter(isValidRow);
  const rows = valid.slice(0, ANC_LAB_MAX_ROWS_PER_PATIENT);
  return { rows, skipped: value.length - rows.length };
}

const RESULT_DATE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)?)?$/;

/**
 * Strict because Date.parse accepts strings Postgres rejects ("1", "March 7",
 * "2026-02-31"), and a future date would outrank every real result. A row with
 * a bad date is kept, undated, rather than lost.
 */
function parseResultDate(value: string | null | undefined): string | null {
  const match = RESULT_DATE.exec(normalizeHosxpDate(value) ?? '');
  if (!match) return null;
  const [, y, m, d, hh, mi, ss = '00', zone = ''] = match;
  const calendar = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    calendar.getUTCFullYear() !== Number(y) ||
    calendar.getUTCMonth() !== Number(m) - 1 ||
    calendar.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  if (hh !== undefined && (Number(hh) > 23 || Number(mi) > 59 || Number(ss) > 59)) return null;
  const iso = hh === undefined ? `${y}-${m}-${d}` : `${y}-${m}-${d}T${hh}:${mi}:${ss}${zone}`;
  return isPlausibleEventDate(iso) ? iso : null;
}

function parseGaWeeks(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const weeks = Math.trunc(value);
  return weeks >= 0 && weeks <= MAX_GA_WEEKS ? weeks : null;
}

/** Keyed so tiny result domains (neg/pos) cannot be recovered by guessing. */
function contentHash(encryptionKey: string, parts: readonly unknown[]): string {
  const hashKey = createHmac('sha256', Buffer.from(encryptionKey, 'hex'))
    .update('anc-lab-content-hash-v1')
    .digest();
  return createHmac('sha256', hashKey).update(JSON.stringify(parts)).digest('hex');
}

/** Sensitive tests keep their outcome only inside the encrypted raw result. */
function plaintextOutcome(classification: AncLabClassification) {
  const test = classification.canonicalTest;
  if (test && ANC_LAB_TESTS[test].sensitive) {
    return { numericValue: null, normalizedValue: null, interpretation: null };
  }
  return {
    numericValue: classification.numericValue,
    normalizedValue: classification.normalizedValue,
    interpretation: classification.interpretation,
  };
}

/**
 * HOSxP's flags and reference text sit beside the result and can reveal it, so
 * they are encrypted on every row. Choosing by test is not safe: a row named
 * HIV that fails its shape check has no canonical test but is still sensitive.
 * A concealed result keeps none of this, since HOSxP withheld it on purpose.
 */
function protectedContext(
  value: string | null | undefined,
  classification: AncLabClassification,
  encryptionKey: string,
): string | null {
  if (classification.concealed || value === null || value === undefined) return null;
  return encrypt(value, encryptionKey);
}

export async function loadExistingLabHashes(
  db: LabReader,
  hospitalId: string,
): Promise<Map<string, string>> {
  const rows = await db.query<{ source_key: string; content_hash: string }>(
    'SELECT source_key, content_hash FROM cached_anc_lab_results WHERE hospital_id = ?',
    [hospitalId],
  );
  return new Map(rows.map((r) => [r.source_key, r.content_hash]));
}

interface UpsertParams {
  hospitalId: string;
  journeyId: string;
  rows: readonly AncLabPayloadRow[];
  existingHashes: Map<string, string>;
  encryptionKey: string;
}

export interface AncLabUpsertOutcome extends Omit<AncLabIngestStats, 'received' | 'skipped'> {
  /** Apply to the push's hash map only after the transaction commits. */
  writtenHashes: Map<string, string>;
}

/** Skips unchanged rows, so a re-pull of the same history costs no writes. */
export async function upsertJourneyLabResults(
  db: LabWriter,
  params: UpsertParams,
): Promise<AncLabUpsertOutcome> {
  const { hospitalId, journeyId, rows, existingHashes, encryptionKey } = params;
  const stats = { upserted: 0, unchanged: 0, unclassified: 0, concealed: 0 };
  const writtenHashes = new Map<string, string>();
  const now = new Date().toISOString();

  for (const row of rows) {
    const classification = classifyAncLab({
      source: row.source,
      ancLabName: row.ancLabName ?? null,
      labItemsName: row.labItemsName ?? null,
      result: row.result ?? null,
    });
    if (!classification.canonicalTest) stats.unclassified++;
    if (classification.concealed) stats.concealed++;

    const sourceKey = `${row.source}:${row.sourceId}`;
    const resultDate = parseResultDate(row.resultDate);
    const gaWeeks = parseGaWeeks(row.gaWeeks);
    const outcome = plaintextOutcome(classification);
    const hash = contentHash(encryptionKey, [
      journeyId,
      resultDate,
      gaWeeks,
      row.ancLabName ?? null,
      row.labItemsName ?? null,
      row.labItemsCode ?? null,
      classification.rawResult,
      row.unit ?? null,
      row.normalReference ?? null,
      row.abnormalFlag ?? null,
      row.ancResultNormalRaw ?? null,
      classification.canonicalTest,
      classification.classificationNote,
      classification.interpretation,
    ]);
    if ((writtenHashes.get(sourceKey) ?? existingHashes.get(sourceKey)) === hash) {
      stats.unchanged++;
      continue;
    }

    await db.execute(
      `INSERT INTO cached_anc_lab_results
         (id, journey_id, hospital_id, source, source_key, result_date, ga_weeks,
          canonical_test, classification_note, anc_lab_name, lab_items_name, lab_items_code,
          raw_result, numeric_value, normalized_value, interpretation, unit, normal_reference,
          abnormal_flag, anc_result_normal_raw, concealed, content_hash, synced_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (hospital_id, source_key) DO UPDATE SET
         journey_id = EXCLUDED.journey_id,
         result_date = EXCLUDED.result_date,
         ga_weeks = EXCLUDED.ga_weeks,
         canonical_test = EXCLUDED.canonical_test,
         classification_note = EXCLUDED.classification_note,
         anc_lab_name = EXCLUDED.anc_lab_name,
         lab_items_name = EXCLUDED.lab_items_name,
         lab_items_code = EXCLUDED.lab_items_code,
         raw_result = EXCLUDED.raw_result,
         numeric_value = EXCLUDED.numeric_value,
         normalized_value = EXCLUDED.normalized_value,
         interpretation = EXCLUDED.interpretation,
         unit = EXCLUDED.unit,
         normal_reference = EXCLUDED.normal_reference,
         abnormal_flag = EXCLUDED.abnormal_flag,
         anc_result_normal_raw = EXCLUDED.anc_result_normal_raw,
         concealed = EXCLUDED.concealed,
         content_hash = EXCLUDED.content_hash,
         synced_at = EXCLUDED.synced_at`,
      [
        uuidv4(),
        journeyId,
        hospitalId,
        row.source,
        sourceKey,
        resultDate,
        gaWeeks,
        classification.canonicalTest,
        classification.classificationNote,
        row.ancLabName ?? null,
        row.labItemsName ?? null,
        row.labItemsCode ?? null,
        classification.rawResult === null ? null : encrypt(classification.rawResult, encryptionKey),
        outcome.numericValue,
        outcome.normalizedValue,
        outcome.interpretation,
        row.unit ?? null,
        protectedContext(row.normalReference, classification, encryptionKey),
        protectedContext(row.abnormalFlag, classification, encryptionKey),
        protectedContext(row.ancResultNormalRaw, classification, encryptionKey),
        classification.concealed,
        hash,
        now,
        now,
      ],
    );
    writtenHashes.set(sourceKey, hash);
    stats.upserted++;
  }
  return { ...stats, writtenHashes };
}

// ─── Visit hemoglobin / hematocrit ──────────────────────────────────────────

export interface VisitLabValue {
  hb?: number;
  hct?: number;
}
/** journeyId → calendar day → values. */
export type VisitLabValues = Map<string, Map<string, VisitLabValue>>;

interface VisitLabRow {
  journey_id: string;
  canonical_test: 'HB' | 'HCT';
  result_date: string | Date;
  numeric_value: number | string;
}

/**
 * Visits are re-inserted on every push, while labs are pulled every few
 * minutes, so visit values must come from the store rather than the payload.
 * A lab only fills the visit on its own day: anything else would attribute a
 * result to a contact where it was not taken.
 */
async function queryVisitLabRows(
  db: LabReader,
  hospitalId: string,
  journeyId?: string,
): Promise<VisitLabRow[]> {
  // anc_lab sorts last so it overwrites a lab order from the same day.
  return db.query<VisitLabRow>(
    `SELECT journey_id, canonical_test, result_date, numeric_value
       FROM cached_anc_lab_results
      WHERE hospital_id = ?
        ${journeyId ? 'AND journey_id = ?' : ''}
        AND canonical_test IN ('HB', 'HCT')
        AND numeric_value IS NOT NULL
        AND result_date IS NOT NULL
      ORDER BY CASE WHEN source = 'anc_lab' THEN 1 ELSE 0 END, result_date, source_key`,
    journeyId ? [hospitalId, journeyId] : [hospitalId],
  );
}

function addVisitLabRows(target: VisitLabValues, rows: readonly VisitLabRow[]): void {
  for (const row of rows) {
    const day = toIsoDate(row.result_date);
    if (!day) continue;
    const days = target.get(row.journey_id) ?? new Map<string, VisitLabValue>();
    const value = days.get(day) ?? {};
    if (row.canonical_test === 'HB') value.hb = Number(row.numeric_value);
    else value.hct = Number(row.numeric_value);
    days.set(day, value);
    target.set(row.journey_id, days);
  }
}

export async function loadVisitLabValues(
  db: LabReader,
  hospitalId: string,
): Promise<VisitLabValues> {
  const target: VisitLabValues = new Map();
  addVisitLabRows(target, await queryVisitLabRows(db, hospitalId));
  return target;
}

/** Re-reads one journey after its labs changed mid-push. */
export async function refreshVisitLabValues(
  db: LabReader,
  hospitalId: string,
  journeyId: string,
  target: VisitLabValues,
): Promise<void> {
  target.delete(journeyId);
  addVisitLabRows(target, await queryVisitLabRows(db, hospitalId, journeyId));
}

// ─── Journey screening columns ──────────────────────────────────────────────

const JOURNEY_LAB_TESTS = [
  'HBSAG',
  'BLOOD_GROUP',
  'RH',
  'DCIP',
  'MCV',
] as const satisfies readonly AncLabTest[];
type JourneyLabTest = (typeof JOURNEY_LAB_TESTS)[number];
const JOURNEY_LAB_REFERRAL_STATUSES = [ReferralStatus.ACCEPTED, ReferralStatus.ARRIVED] as const;

interface JourneyLabRow {
  canonical_test: JourneyLabTest;
  interpretation: string | null;
  numeric_value: number | string | null;
  normalized_value: string | null;
  classification_note: string | null;
  hospital_id: string;
  journey_hospital_id: string;
  current_rh_factor: string | null;
}

function posNeg(interpretation: string | null): 'POS' | 'NEG' | null {
  if (interpretation === 'positive') return 'POS';
  if (interpretation === 'negative') return 'NEG';
  return null;
}

/**
 * The newest usable result per test, from the hospitals linked to the journey.
 * Any hospital can push labs for a shared CID, and those stay visible in the
 * lab list, but only the registering hospital, or one the journey was referred
 * to and that accepted, may set these columns. current_hospital_id is no proof:
 * creating a referral sets it to the sender. The two hospitals must differ
 * because only the destination is checked when a referral is accepted, so a
 * hospital could otherwise refer a woman to itself and accept.
 * Undated rows are passed over because their date failed validation.
 *
 * HBsAg and DCIP follow the newest row that holds a result: when that result is
 * not a clear POS or NEG the column is cleared, because keeping an older NEG
 * would leave a green tile over a newer abnormal. Missing and concealed rows
 * say nothing either way, so they are skipped.
 *
 * Deliberately excludes: HIV/VDRL, which keep their person_anc source and are
 * not newly exposed through a plaintext column; and OGTT, because grading a
 * glucose needs thresholds nobody has signed off and the journey page paints
 * any text other than ABNORMAL as normal.
 */
export async function refreshJourneyLabColumns(
  db: LabWriter & LabReader,
  journeyId: string,
): Promise<void> {
  const rows = await db.query<JourneyLabRow>(
    `SELECT r.canonical_test, r.interpretation, r.numeric_value, r.normalized_value,
            r.classification_note, r.hospital_id, j.hospital_id AS journey_hospital_id,
            j.rh_factor AS current_rh_factor
       FROM cached_anc_lab_results r
       INNER JOIN maternal_journeys j ON j.id = r.journey_id
      WHERE r.journey_id = ?
        AND (
          r.hospital_id = j.hospital_id
          OR EXISTS (
            SELECT 1 FROM cached_referrals cr
             WHERE cr.journey_id = r.journey_id
               AND cr.to_hospital_id = r.hospital_id
               AND cr.from_hospital_id <> cr.to_hospital_id
               AND cr.status IN (${JOURNEY_LAB_REFERRAL_STATUSES.map(() => '?').join(', ')})
          )
        )
        AND r.result_date IS NOT NULL
        AND r.canonical_test IN (${JOURNEY_LAB_TESTS.map(() => '?').join(', ')})
      ORDER BY r.result_date DESC, r.synced_at DESC, r.source_key`,
    [journeyId, ...JOURNEY_LAB_REFERRAL_STATUSES, ...JOURNEY_LAB_TESTS],
  );

  // In every helper: undefined = no evidence, leave the column; null = clear it.
  const latest = (test: JourneyLabTest, read: (r: JourneyLabRow) => string | number | null) => {
    for (const row of rows) {
      if (row.canonical_test !== test) continue;
      const value = read(row);
      if (value !== null) return value;
    }
    return undefined;
  };
  const newestResult = (test: JourneyLabTest) => {
    // Awaiting obstetric sign-off: see ANC_LAB_STICKY_POSITIVE_TESTS.
    if (
      ANC_LAB_STICKY_POSITIVE_TESTS.includes(test) &&
      rows.some((r) => r.canonical_test === test && r.interpretation === 'positive')
    ) {
      return 'POS' as const;
    }
    const newest = rows.find(
      (r) =>
        r.canonical_test === test &&
        r.interpretation !== 'missing' &&
        r.interpretation !== 'concealed',
    );
    return newest ? posNeg(newest.interpretation) : undefined;
  };

  /** A blood group's sign counts only when no signed results disagree. */
  const rhFromBloodGroup = (): 'POS' | 'NEG' | undefined => {
    const signs = new Set(
      rows
        .filter((r) => r.canonical_test === 'BLOOD_GROUP')
        .map((r) => r.normalized_value?.match(/[+-]$/)?.[0])
        .filter((sign) => sign !== undefined),
    );
    if (signs.size !== 1) return undefined;
    return signs.has('-') ? 'NEG' : 'POS';
  };

  /**
   * Undoes a NEG this code derived from the ANC form's bare word before that
   * word stopped counting. Losing a true Rh-negative is the worse error, so it
   * needs that exact word from the registering hospital. Another hospital's
   * row, or a webhook-supplied NEG with no such row, leaves the value alone.
   */
  const rhNegativeFromFormWord = (): null | undefined =>
    rows[0]?.current_rh_factor === 'NEG' &&
    rows.some(
      (r) =>
        r.classification_note === ANC_LAB_RH_FORM_WORD_NOTE &&
        r.hospital_id === r.journey_hospital_id,
    )
      ? null
      : undefined;

  const columns: [string, string | number | null | undefined][] = [
    // The ABO letter only: rh_factor carries the sign, and screens print both.
    ['blood_group', latest('BLOOD_GROUP', (r) => r.normalized_value?.replace(/[+-]$/, '') ?? null)],
    [
      'rh_factor',
      latest('RH', (r) => posNeg(r.interpretation)) ??
        rhFromBloodGroup() ??
        rhNegativeFromFormWord(),
    ],
    ['hbsag_result', newestResult('HBSAG')],
    ['mcv_fl', latest('MCV', (r) => (r.numeric_value === null ? null : Number(r.numeric_value)))],
    ['dcip_result', newestResult('DCIP')],
  ];
  const changes = columns.filter(([, value]) => value !== undefined);
  if (changes.length === 0) return;

  await db.execute(
    `UPDATE maternal_journeys SET ${changes.map(([column]) => `${column} = ?`).join(', ')},
       updated_at = ?
     WHERE id = ?`,
    [...changes.map(([, value]) => value), new Date().toISOString(), journeyId],
  );
}
