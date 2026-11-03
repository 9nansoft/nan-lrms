// src/config/obstetric-display.ts
// Thai obstetric wording shared by the ward board and the patient page. Words
// only: each component keeps its own cut-offs. Three cut-off sets exist today,
// and that is a clinical ruling, recorded under the spec's Out of scope.
import type { StatusTone } from '@/config/status-tone';

export const LABOUR_PHASE_LABEL_TH = {
  latent: 'ระยะแฝง',
  active: 'ระยะเร่ง',
  transition: 'ระยะเปลี่ยนผ่าน',
} as const;

export type GaTerm = 'veryPreterm' | 'preterm' | 'term' | 'postTerm';

/** GA band shown under the GA value. Cut-offs moved verbatim from
 *  QuickStatsBar/ClinicalData (< 34, < 37, > 41 weeks). */
export function classifyGaTerm(weeks: number | null): GaTerm | null {
  if (weeks == null) return null;
  if (weeks < 34) return 'veryPreterm';
  if (weeks < 37) return 'preterm';
  if (weeks > 41) return 'postTerm';
  return 'term';
}

/** Severity tone per GA band: term ok, preterm warn, < 34 or > 41 danger. */
export const GA_TERM_TONE: Record<GaTerm, StatusTone> = {
  veryPreterm: 'danger',
  preterm: 'warn',
  term: 'ok',
  postTerm: 'danger',
};

export const GA_TERM_LABEL_TH: Record<GaTerm, string> = {
  veryPreterm: 'ก่อนกำหนดมาก',
  preterm: 'ก่อนกำหนด',
  term: 'ครบกำหนด',
  postTerm: 'เกินกำหนด',
};

/** Maternal-journey care stage → Thai (journey page has a private copy;
 *  its owning sub-project switches it to this one). */
export const CARE_STAGE_LABEL_TH: Record<string, string> = {
  PREGNANCY: 'ฝากครรภ์',
  LABOR: 'ระหว่างคลอด',
  DELIVERED: 'คลอดแล้ว',
  POSTPARTUM: 'หลังคลอด',
};
