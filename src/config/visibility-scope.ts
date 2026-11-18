// Patient-visibility policy — who may read whose patient rows.
//
// Constitution IV: policy lives in config, not in components or route
// handlers. src/services/visibility-scope.ts reads this file and applies it;
// routes never decide scope on their own.
//
// The shape of the rule:
//   - a hospital sees its OWN patients
//   - a hospital sees a patient of ANOTHER hospital only when that patient
//     was referred in to it (the referral rows are built from HOSxP's
//     referin / referout tables — see src/services/sync/referrals.ts)
//   - a node hospital sees every patient of the hospitals it supervises
//   - a centre hospital sees every hospital's patients
import { HospitalLevel } from '@/types/domain';
import { NON_REPORTING_HCODES } from './hospital-network';

/** Referral statuses that still hold a link. A rejected or expired referral
 *  never opened one, so the sender's rows stay closed to the receiver. */
export const REFERRAL_ACCESS_STATUSES = [
  'INITIATED',
  'ACCEPTED',
  'IN_TRANSIT',
  'ARRIVED',
] as const;

/** Hospital levels that read every hospital's patients (รพ.ศูนย์). The
 *  provincial centre is the referral hub of the province, so it needs the
 *  whole picture; a community hospital never does. */
export const CENTER_HOSPITAL_LEVELS: readonly string[] = [
  HospitalLevel.P,
  HospitalLevel.P_PLUS,
];

/** Accounts that stand for the province or the system rather than for one
 *  hospital (สสจ.น่าน '00042', system '00000'). They administer the province,
 *  so they read every hospital's patients. */
export const ALL_SCOPE_HCODES: readonly string[] = NON_REPORTING_HCODES;

/** Per-hospital visibility setting, stored in hospitals.visibility_scope. */
export type VisibilityScope = 'OWN' | 'ALL';

export const VISIBILITY_SCOPES: readonly VisibilityScope[] = ['OWN', 'ALL'];

/** The scope a hospital row means. A missing or unparsable value is 'OWN' —
 *  the narrow scope is the safe default. */
export function parseVisibilityScope(value: unknown): VisibilityScope {
  return value === 'ALL' ? 'ALL' : 'OWN';
}

export const VISIBILITY_SCOPE_LABEL_TH: Record<VisibilityScope, string> = {
  OWN: 'เฉพาะ รพ. ตัวเอง (และคนไข้ที่ถูกส่งต่อเข้ามา)',
  ALL: 'ทุก รพ. (ดูข้อมูลคนไข้ทั้งจังหวัด)',
};

/** Thai label for a scope value coming from the database. */
export function visibilityScopeLabelTh(value: unknown): string {
  return VISIBILITY_SCOPE_LABEL_TH[parseVisibilityScope(value)];
}
