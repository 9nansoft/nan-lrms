/**
 * Who may read a journey's lab results, which include HIV and syphilis outcomes.
 * The journey pages are province-wide, so this is the only gate on these rows.
 *
 * A link counts as full access only if another party vouches for it. A hospital
 * can create its own visit, lab, admission or referral-from rows, or set
 * current_hospital_id, simply by pushing data, so those cannot unlock anyone
 * else's results. They unlock only rows from that hospital, which it already
 * holds in its own HOSxP, so a fabricated row reveals nothing.
 *
 * Role and the exempt or read-only hcodes grant nothing: mapPositionToRole can
 * make any director an ADMIN, and those hcodes are not care providers.
 */
import type { DatabaseAdapter } from '@/db/adapter';
import { ANC_SEROLOGY_RISK_KEYS, isRestrictedDiagnosisCode } from '@/config/anc-risk-rules';
import { listJourneyLabResults, type JourneyLabResult } from '@/services/anc-lab-results';
import { getJourneyDetail } from '@/services/journey-list';
import {
  getReferralDetail,
  listReferrals,
  type ReferralListFilters,
} from '@/services/referral-list';
import type { JourneyDetailResponse, ReferralDetail, ReferralListResponse } from '@/types/api';
import { ReferralStatus } from '@/types/domain';

export type JourneyLabTier = 'full' | 'own_results';

export type JourneyLabRead =
  | { status: 'not_found' }
  | { status: 'denied' }
  | { status: 'ok'; tier: JourneyLabTier; results: JourneyLabResult[] };

/**
 * Pending referrals count because receiving staff need results before arrival;
 * the sender is the other, authenticated hospital. Rejected and expired do not.
 */
const FULL_ACCESS_REFERRAL_STATUSES = [
  ReferralStatus.INITIATED,
  ReferralStatus.ACCEPTED,
  ReferralStatus.IN_TRANSIT,
  ReferralStatus.ARRIVED,
] as const;

/** Needs the viewer as `h` and the journey as `mj`; binds the statuses once. */
const IS_REFERRAL_DESTINATION = `EXISTS (SELECT 1 FROM cached_referrals r
                     WHERE r.journey_id = mj.id
                       AND r.to_hospital_id = h.id
                       AND r.from_hospital_id <> r.to_hospital_id
                       AND r.status IN (${FULL_ACCESS_REFERRAL_STATUSES.map(() => '?').join(', ')}))`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface LinkRow {
  hospital_id: string;
  is_registering: boolean;
  is_referral_destination: boolean;
  has_own_records: boolean;
}

async function hospitalLink(
  db: DatabaseAdapter,
  journeyId: string,
  hospitalCode: string,
): Promise<LinkRow | undefined> {
  const rows = await db.query<LinkRow>(
    `SELECT h.id AS hospital_id,
            (mj.hospital_id = h.id) AS is_registering,
            ${IS_REFERRAL_DESTINATION} AS is_referral_destination,
            (EXISTS (SELECT 1 FROM cached_anc_visits v
                      WHERE v.journey_id = mj.id AND v.hospital_id = h.id)
             OR EXISTS (SELECT 1 FROM cached_anc_lab_results l
                         WHERE l.journey_id = mj.id AND l.hospital_id = h.id)
             OR EXISTS (SELECT 1 FROM cached_patients p
                         WHERE p.journey_id = mj.id AND p.hospital_id = h.id)) AS has_own_records
       FROM hospitals h
       INNER JOIN maternal_journeys mj ON mj.id = ?
      WHERE h.hcode = ?`,
    [...FULL_ACCESS_REFERRAL_STATUSES, journeyId, hospitalCode],
  );
  return rows[0];
}

function hasFullAccess(link: LinkRow | undefined): boolean {
  return Boolean(link?.is_registering || link?.is_referral_destination);
}

/** The same test as hasFullAccess, for a whole page of journeys in one query. */
async function journeysWithFullAccess(
  db: DatabaseAdapter,
  journeyIds: string[],
  hospitalCode: string | null | undefined,
): Promise<Set<string>> {
  if (!hospitalCode || journeyIds.length === 0) return new Set();
  const rows = await db.query<{ id: string }>(
    `SELECT mj.id
       FROM hospitals h
       INNER JOIN maternal_journeys mj ON mj.id IN (${journeyIds.map(() => '?').join(', ')})
      WHERE h.hcode = ?
        AND (mj.hospital_id = h.id OR ${IS_REFERRAL_DESTINATION})`,
    [...journeyIds, hospitalCode, ...FULL_ACCESS_REFERRAL_STATUSES],
  );
  return new Set(rows.map((row) => row.id));
}

function hasRestrictedCode(referral: { diagnosisCode: string | null }): boolean {
  return Boolean(referral.diagnosisCode && isRestrictedDiagnosisCode(referral.diagnosisCode));
}

function blankRestrictedCode<T extends { diagnosisCode: string | null }>(referral: T): T {
  return hasRestrictedCode(referral) ? { ...referral, diagnosisCode: null } : referral;
}

/**
 * A withheld code must look exactly like a referral with no code: marking the
 * row as restricted would itself say the diagnosis is HIV or syphilis.
 */
async function withholdRestrictedCodes<
  T extends { journeyId: string; diagnosisCode: string | null },
>(db: DatabaseAdapter, referrals: T[], hospitalCode: string | null | undefined): Promise<T[]> {
  const journeyIds = [...new Set(referrals.filter(hasRestrictedCode).map((r) => r.journeyId))];
  if (journeyIds.length === 0) return referrals;
  const allowed = await journeysWithFullAccess(db, journeyIds, hospitalCode);
  return referrals.map((r) => (allowed.has(r.journeyId) ? r : blankRestrictedCode(r)));
}

/** Removes every statement of HIV or syphilis status from a journey detail. */
function withholdSerology(detail: JourneyDetailResponse): JourneyDetailResponse {
  return {
    ...detail,
    journey: { ...detail.journey, hivResult: null, vdrlResult: null },
    latestRisk: detail.latestRisk && {
      ...detail.latestRisk,
      triggeredRules: detail.latestRisk.triggeredRules.filter(
        (rule) => !ANC_SEROLOGY_RISK_KEYS.has(rule),
      ),
    },
    referrals: detail.referrals.map(blankRestrictedCode),
  };
}

export type JourneyDetailRead = JourneyDetailResponse & { serologyWithheld: boolean };

/**
 * The only way the detail route reads a journey. The page stays province-wide,
 * but HIV and syphilis status follow the labs route's full tier. Own-records
 * hospitals are excluded too: these columns can come from any hospital.
 */
export async function readJourneyDetailForHospital(
  db: DatabaseAdapter,
  journeyId: string,
  hospitalCode: string | null | undefined,
): Promise<JourneyDetailRead | null> {
  const detail = await getJourneyDetail(db, journeyId);
  if (detail === null) return null;
  const link = hospitalCode ? await hospitalLink(db, journeyId, hospitalCode) : undefined;
  return hasFullAccess(link)
    ? { ...detail, serologyWithheld: false }
    : { ...withholdSerology(detail), serologyWithheld: true };
}

/** The only way the referral board reads its list; the board stays province-wide. */
export async function readReferralListForHospital(
  db: DatabaseAdapter,
  filters: ReferralListFilters,
  hospitalCode: string | null | undefined,
): Promise<ReferralListResponse> {
  const list = await listReferrals(db, filters);
  return { ...list, referrals: await withholdRestrictedCodes(db, list.referrals, hospitalCode) };
}

/** The only way the referral detail dialog reads a referral. */
export async function readReferralDetailForHospital(
  db: DatabaseAdapter,
  id: string,
  hospitalCode: string | null | undefined,
): Promise<ReferralDetail | null> {
  const referral = await getReferralDetail(db, id);
  if (referral === null) return null;
  const [visible] = await withholdRestrictedCodes(db, [referral], hospitalCode);
  return visible;
}

/** The only way the labs route reads results, so tier and filter cannot drift. */
export async function readJourneyLabsForHospital(
  db: DatabaseAdapter,
  journeyId: string,
  hospitalCode: string | null | undefined,
): Promise<JourneyLabRead> {
  if (!UUID.test(journeyId)) return { status: 'not_found' };
  const journeys = await db.query<{ id: string }>('SELECT id FROM maternal_journeys WHERE id = ?', [
    journeyId,
  ]);
  if (journeys.length === 0) return { status: 'not_found' };
  if (!hospitalCode) return { status: 'denied' };

  const link = await hospitalLink(db, journeyId, hospitalCode);
  if (hasFullAccess(link)) {
    return { status: 'ok', tier: 'full', results: await listJourneyLabResults(db, journeyId) };
  }
  if (link?.has_own_records) {
    // Only this hospital's rows: see the module note on what a link proves.
    const results = await listJourneyLabResults(db, journeyId, {
      onlyHospitalId: link.hospital_id,
    });
    return { status: 'ok', tier: 'own_results', results };
  }
  return { status: 'denied' };
}
