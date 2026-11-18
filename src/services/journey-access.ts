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
import { REFERRAL_ACCESS_STATUSES } from '@/config/visibility-scope';
import { listJourneyLabResults, type JourneyLabResult } from '@/services/anc-lab-results';
import { getJourneyDetail } from '@/services/journey-list';
import {
  getReferralDetail,
  listReferrals,
  type ReferralListFilters,
} from '@/services/referral-list';
import {
  scopeAllowsHospitalId,
  type ViewerScope,
} from '@/services/visibility-scope';
import type { JourneyDetailResponse, ReferralDetail, ReferralListResponse } from '@/types/api';

export type JourneyLabTier = 'full' | 'own_results';

export type JourneyLabRead =
  | { status: 'not_found' }
  | { status: 'denied' }
  | { status: 'ok'; tier: JourneyLabTier; results: JourneyLabResult[] };

/**
 * Pending referrals count because receiving staff need results before arrival;
 * the sender is the other, authenticated hospital. Rejected and expired do not.
 * The list lives in src/config/visibility-scope.ts so this gate and the
 * patient-visibility scope can never disagree about what a referral means.
 */
const FULL_ACCESS_REFERRAL_STATUSES = REFERRAL_ACCESS_STATUSES;

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
  /** The hospital that registered the pregnancy. */
  journey_hospital_id: string | null;
  /** The hospital that holds her now. */
  journey_current_hospital_id: string | null;
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
            mj.hospital_id AS journey_hospital_id,
            mj.current_hospital_id AS journey_current_hospital_id,
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

/**
 * The reader may read this journey when it registered the pregnancy, when it
 * is the referral destination, or when the pregnancy sits with a hospital
 * inside the reader's visibility scope (the node tree).
 */
function hasFullAccess(link: LinkRow | undefined, scope?: ViewerScope): boolean {
  if (link?.is_registering || link?.is_referral_destination) return true;
  if (!scope) return false;
  if (scope.mode === 'ALL') return true;
  if (link?.journey_hospital_id && scopeAllowsHospitalId(scope, link.journey_hospital_id)) {
    return true;
  }
  if (
    link?.journey_current_hospital_id &&
    scopeAllowsHospitalId(scope, link.journey_current_hospital_id)
  ) {
    return true;
  }
  return false;
}

/** The same test as hasFullAccess, for a whole page of journeys in one query. */
async function journeysWithFullAccess(
  db: DatabaseAdapter,
  journeyIds: string[],
  hospitalCode: string | null | undefined,
  scope?: ViewerScope,
): Promise<Set<string>> {
  if (!hospitalCode || journeyIds.length === 0) return new Set();
  const scopeIds = scope && scope.mode === 'SCOPED' ? scope.allowedHospitalIds : [];
  const scopeClause =
    scopeIds.length > 0
      ? ` OR mj.hospital_id IN (${scopeIds.map(() => '?').join(', ')})
          OR mj.current_hospital_id IN (${scopeIds.map(() => '?').join(', ')})`
      : '';
  const rows = await db.query<{ id: string }>(
    `SELECT mj.id
       FROM hospitals h
       INNER JOIN maternal_journeys mj ON mj.id IN (${journeyIds.map(() => '?').join(', ')})
      WHERE h.hcode = ?
        AND (mj.hospital_id = h.id OR ${IS_REFERRAL_DESTINATION}${scopeClause})`,
    [
      ...journeyIds,
      hospitalCode,
      ...FULL_ACCESS_REFERRAL_STATUSES,
      ...scopeIds,
      ...scopeIds,
    ],
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
>(
  db: DatabaseAdapter,
  referrals: T[],
  hospitalCode: string | null | undefined,
  scope?: ViewerScope,
): Promise<T[]> {
  const journeyIds = [...new Set(referrals.filter(hasRestrictedCode).map((r) => r.journeyId))];
  if (journeyIds.length === 0) return referrals;
  const allowed = await journeysWithFullAccess(db, journeyIds, hospitalCode, scope);
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
  scope?: ViewerScope,
): Promise<JourneyDetailRead | null> {
  const detail = await getJourneyDetail(db, journeyId);
  if (detail === null) return null;
  const link = hospitalCode ? await hospitalLink(db, journeyId, hospitalCode) : undefined;
  // A scoped reader sees only the pregnancies inside its scope: its own
  // hospital's, the ones it is the referral destination for, and the ones a
  // hospital it supervises holds. A hospital that holds records of its own
  // for the pregnancy still sees it — without the serology. Everything else
  // is not found for them.
  if (
    scope &&
    scope.mode === 'SCOPED' &&
    !hasFullAccess(link, scope) &&
    !link?.has_own_records
  ) {
    return null;
  }
  return hasFullAccess(link, scope)
    ? { ...detail, serologyWithheld: false }
    : { ...withholdSerology(detail), serologyWithheld: true };
}

/** The only way the referral board reads its list; the board shows the
 *  referrals the reader is a party to. */
export async function readReferralListForHospital(
  db: DatabaseAdapter,
  filters: ReferralListFilters,
  hospitalCode: string | null | undefined,
  scope?: ViewerScope,
): Promise<ReferralListResponse> {
  const list = await listReferrals(db, filters, new Date(), scope);
  return {
    ...list,
    referrals: await withholdRestrictedCodes(db, list.referrals, hospitalCode, scope),
  };
}

/** The only way the referral detail dialog reads a referral. */
export async function readReferralDetailForHospital(
  db: DatabaseAdapter,
  id: string,
  hospitalCode: string | null | undefined,
  scope?: ViewerScope,
): Promise<ReferralDetail | null> {
  const referral = await getReferralDetail(db, id);
  if (referral === null) return null;
  if (scope && !(await referralInScope(db, scope, id))) return null;
  const [visible] = await withholdRestrictedCodes(db, [referral], hospitalCode, scope);
  return visible;
}

/** True when the reader is a party to the referral, or when the referral
 *  touches a hospital inside the reader's visibility scope. */
async function referralInScope(
  db: DatabaseAdapter,
  scope: ViewerScope,
  referralId: string,
): Promise<boolean> {
  if (scope.mode === 'ALL') return true;
  const rows = await db.query<{
    from_hospital_id: string | null;
    to_hospital_id: string | null;
  }>('SELECT from_hospital_id, to_hospital_id FROM cached_referrals WHERE id = ?', [referralId]);
  const row = rows[0];
  if (!row) return false;
  const parties = [row.from_hospital_id, row.to_hospital_id].filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  return parties.some((id) => scopeAllowsHospitalId(scope, id));
}

/** The only way the labs route reads results, so tier and filter cannot drift. */
export async function readJourneyLabsForHospital(
  db: DatabaseAdapter,
  journeyId: string,
  hospitalCode: string | null | undefined,
  scope?: ViewerScope,
): Promise<JourneyLabRead> {
  if (!UUID.test(journeyId)) return { status: 'not_found' };
  const journeys = await db.query<{ id: string }>('SELECT id FROM maternal_journeys WHERE id = ?', [
    journeyId,
  ]);
  if (journeys.length === 0) return { status: 'not_found' };
  if (!hospitalCode) return { status: 'denied' };

  const link = await hospitalLink(db, journeyId, hospitalCode);
  if (hasFullAccess(link, scope)) {
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
