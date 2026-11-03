// ANC (antenatal care) freshness gates for the PREGNANCY-stage registry.
//
// These thresholds exclude stale rows that were migrated/loaded with
// care_stage = 'PREGNANCY' but whose owners have already delivered or were
// lost to follow-up. Without them the ANC list surfaced pregnancies with EDC
// from 2010–2019, inflating every count. The gates are applied ONLY to the
// PREGNANCY stage — LABOR / DELIVERED rows are never gated.
//
// Consumed by src/services/journey-list.ts (listJourneys / listHospitalJourneys)
// and, transitively, by GET /api/journeys and GET /api/hospitals/[hcode]/journeys.
//
// Cutoffs are resolved to absolute timestamps in application code
// (see ancFreshnessCutoffs) and bound as SQL parameters, so the identical
// logic runs on Postgres (production) and SQLite (unit tests) without any
// DB-specific date arithmetic (NOW() / INTERVAL).

/**
 * Maximum gestational age, in weeks. `ga_weeks` above this is post-term and
 * biologically implies the pregnancy has already ended.
 */
export const ANC_MAX_GA_WEEKS = 42;

/**
 * How many days past the estimated delivery date (EDC) a pregnancy may fall
 * before it is treated as delivered and dropped from the active registry.
 */
export const ANC_EDC_MAX_PAST_DAYS = 14;

/**
 * Maximum age, in days, of the last ANC visit before the woman is considered
 * lost to follow-up at this hospital.
 */
export const ANC_LAST_VISIT_MAX_AGE_DAYS = 60;

/**
 * How many days a PREGNANCY journey may go unrefreshed by any sync while
 * absent from her hospital's HOSxP active-ANC list before reconciliation
 * closes it (closeAbsentAncJourneys). Absence from a complete list is already
 * proof she left the ANC registry; the grace only rides out a transient edit
 * in HOSxP that drops her from one cycle.
 */
export const ANC_ABSENT_CLOSE_GRACE_DAYS = 7;

/**
 * maternal_journeys.closed_reason for a journey closed because HOSxP stopped
 * listing her — NOT a recorded delivery, so delivery KPIs exclude it and a
 * later HOSxP listing reopens it (reopenReconciledJourney).
 */
export const ANC_ABSENT_CLOSED_REASON = 'hosxp_anc_absent';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What the "ANC Registry" number on every screen actually counts.
 *
 * The figure was rendered under a bare "ANC REGISTRY" label on the dashboard,
 * the /pregnancies board and the hospital console with nothing stating the
 * cohort — so when two of those disagreed it read as broken data rather than
 * as two different questions asked of the same rows. Both strings are built
 * from the thresholds above, so the description cannot drift away from the
 * rule the SQL applies.
 */
export const ANC_REGISTRY_LABEL_TH = 'หญิงตั้งครรภ์ที่ยังติดตามอยู่';

export const ANC_REGISTRY_CRITERIA_TH =
  `นับเฉพาะรายที่ยังติดตามอยู่: อายุครรภ์ไม่เกิน ${ANC_MAX_GA_WEEKS} สัปดาห์ · ` +
  `ไม่เลยกำหนดคลอด (EDC) เกิน ${ANC_EDC_MAX_PAST_DAYS} วัน · ` +
  `มาฝากครรภ์ครั้งล่าสุดภายใน ${ANC_LAST_VISIT_MAX_AGE_DAYS} วัน — ` +
  `รายที่คลอดไปแล้วหรือขาดการติดตามจะไม่นับในตัวเลขนี้`;

export interface AncFreshnessCutoffs {
  /** ISO timestamp — an EDC on or after this is still considered active. */
  edcOnOrAfter: string;
  /** ISO timestamp — a last-ANC date on or after this is still considered active. */
  lastAncOnOrAfter: string;
}

/**
 * Resolve the absolute cutoff timestamps for the EDC and last-ANC gates,
 * relative to `now`. Pure and deterministic so it can be unit-tested and so
 * a request computes both gates against a single, consistent clock reading.
 */
export function ancFreshnessCutoffs(now: Date = new Date()): AncFreshnessCutoffs {
  return {
    edcOnOrAfter: new Date(now.getTime() - ANC_EDC_MAX_PAST_DAYS * DAY_MS).toISOString(),
    lastAncOnOrAfter: new Date(now.getTime() - ANC_LAST_VISIT_MAX_AGE_DAYS * DAY_MS).toISOString(),
  };
}

export interface AncFreshnessSql {
  /** SQL predicate over a maternal_journeys row. */
  clause: string;
  /** Bind in this order, following any earlier params in the same query. */
  params: unknown[];
}

/**
 * The canonical "still being followed" predicate for the ANC registry.
 *
 * EVERY ANC Registry count in the app must compose from this. The province
 * dashboard, the /pregnancies board and the /hospitals console each used to
 * hand-roll their own copy of these three gates, and the console's copy left
 * them out entirely — so one label ("ANC Registry") reported 3162 on one page
 * and 1517 on another off the very same rows. Counting one cohort must be a
 * property of this function, not of three call sites agreeing by luck.
 *
 * `alias` is the maternal_journeys alias in the caller's query (pass '' when
 * the query selects from the table unaliased).
 */
/**
 * The hospital-scope half of the ANC registry definition: a woman belongs to
 * the province registry when the hospital that registered her, or the hospital
 * currently caring for her, is an active hospital in the network. The `OR`
 * matters for referrals — a woman moved to another site keeps her registering
 * hospital, and a woman whose registering hospital was offboarded is still
 * being cared for somewhere.
 *
 * The /pregnancies board used to scope by an inner join on the registering
 * hospital alone (ignoring is_active) while the dashboard cards used this
 * predicate. Both counted 1517 only because no hospital happened to be
 * deactivated; the moment one was, the two headline numbers drifted apart by
 * the number of women registered there.
 */
export function ancRegistryScopeSql(alias = 'mj'): string {
  const col = alias ? `${alias}.` : '';
  const active = '(SELECT id FROM hospitals WHERE is_active = true)';
  return `(${col}hospital_id IN ${active} OR ${col}current_hospital_id IN ${active})`;
}

export function ancFreshnessSql(alias = 'mj', now: Date = new Date()): AncFreshnessSql {
  const { edcOnOrAfter, lastAncOnOrAfter } = ancFreshnessCutoffs(now);
  const col = alias ? `${alias}.` : '';
  return {
    clause:
      `(${col}ga_weeks IS NULL OR ${col}ga_weeks <= ?)` +
      ` AND (${col}edc IS NULL OR ${col}edc >= ?)` +
      ` AND (${col}last_anc_date IS NULL OR ${col}last_anc_date >= ?)`,
    params: [ANC_MAX_GA_WEEKS, edcOnOrAfter, lastAncOnOrAfter],
  };
}
