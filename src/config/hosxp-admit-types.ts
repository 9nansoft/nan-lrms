// HOSxP `ipt_admit_type.ipt_admit_type_id` — the admission type staff pick on
// the IPD admit form. Identical at every hospital (HOSxP seed data):
//   1 ทั่วไป · 2 อุบัติเหตุ/Refer · 3 คลอดบุตร · 4 แรกเกิด · 5 Ambulatory (ODS)
export const HOSXP_ADMIT_TYPE = {
  GENERAL: 1,
  ACCIDENT_REFER: 2,
  LABOUR: 3,
  NEWBORN: 4,
  AMBULATORY: 5,
} as const;

/** True when a HOSxP row's admit type is แรกเกิด. Drivers return the id as a
 *  number or a numeric string; anything else (null, blank) is not a newborn. */
export function isNewbornAdmitType(id: unknown): boolean {
  return id != null && id !== '' && Number(id) === HOSXP_ADMIT_TYPE.NEWBORN;
}
