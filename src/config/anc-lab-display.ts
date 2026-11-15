/**
 * How ANC lab results are grouped and named on screen. The rules that use this
 * live in src/services/anc-lab-presentation.ts.
 */
import type { AncLabSource, AncLabTest } from '@/config/anc-lab-canon';

export const ANC_LAB_TEST_LABEL: Record<AncLabTest, string> = {
  HB: 'Hb',
  HCT: 'Hct',
  HBSAG: 'HBsAg',
  VDRL_RPR: 'VDRL / RPR',
  TREPONEMAL: 'Treponemal',
  SYPHILIS_UNSPECIFIED: 'Syphilis',
  HIV: 'Anti-HIV',
  CD4: 'CD4',
  MCV: 'MCV',
  MCH: 'MCH',
  OF: 'OF',
  DCIP: 'DCIP',
  HB_TYPING: 'Hb typing',
  GST: 'GCT / GST',
  OGTT_FASTING: 'OGTT ก่อนดื่ม',
  OGTT_1H: 'OGTT 1 ชม.',
  OGTT_2H: 'OGTT 2 ชม.',
  OGTT_3H: 'OGTT 3 ชม.',
  OGTT_UNSPECIFIED: 'OGTT (ไม่ระบุเวลา)',
  BLOOD_GROUP: 'หมู่เลือด ABO',
  RH: 'Rh',
  URINE_ALBUMIN: 'Urine albumin',
  URINE_SUGAR: 'Urine sugar',
  ALPHA1: 'Alpha-1',
  THAL_RESULT: 'ผลตรวจธาลัสซีเมีย',
  PARTNER_OF: 'OF (สามี)',
  PARTNER_DCIP: 'DCIP (สามี)',
  PARTNER_HB_TYPING: 'Hb typing (สามี)',
  PARTNER_ALPHA1: 'Alpha-1 (สามี)',
  PARTNER_THAL_RESULT: 'ผลตรวจธาลัสซีเมีย (สามี)',
};

export interface AncLabPanelGroup {
  id: string;
  titleTh: string;
  tests: readonly AncLabTest[];
}

/** Every AncLabTest belongs to exactly one group, or it would never be shown. */
export const ANC_LAB_PANEL_GROUPS: readonly AncLabPanelGroup[] = [
  { id: 'hematology', titleTh: 'ความเข้มข้นของเลือด', tests: ['HB', 'HCT'] },
  {
    id: 'infection',
    titleTh: 'คัดกรองการติดเชื้อ',
    tests: ['HBSAG', 'VDRL_RPR', 'TREPONEMAL', 'SYPHILIS_UNSPECIFIED', 'HIV', 'CD4'],
  },
  {
    id: 'thalassemia',
    titleTh: 'ธาลัสซีเมีย',
    tests: ['MCV', 'MCH', 'OF', 'DCIP', 'HB_TYPING', 'ALPHA1', 'THAL_RESULT'],
  },
  {
    id: 'thalassemia_partner',
    titleTh: 'ธาลัสซีเมีย (สามี)',
    tests: [
      'PARTNER_OF',
      'PARTNER_DCIP',
      'PARTNER_HB_TYPING',
      'PARTNER_ALPHA1',
      'PARTNER_THAL_RESULT',
    ],
  },
  {
    id: 'glucose',
    titleTh: 'น้ำตาลในเลือด / OGTT',
    tests: ['GST', 'OGTT_FASTING', 'OGTT_1H', 'OGTT_2H', 'OGTT_3H', 'OGTT_UNSPECIFIED'],
  },
  { id: 'blood_group', titleTh: 'หมู่เลือด', tests: ['BLOOD_GROUP', 'RH'] },
  { id: 'urine', titleTh: 'ปัสสาวะ', tests: ['URINE_ALBUMIN', 'URINE_SUGAR'] },
];

/** Numeric tests drawn as a trend when they have been repeated. */
export const ANC_LAB_TREND_TESTS: readonly AncLabTest[] = ['HB', 'HCT'];

export interface AncLabCoreItem {
  id: string;
  labelTh: string;
  /** Any one of these on file counts; hospitals record the same screen differently. */
  tests: readonly AncLabTest[];
}

/**
 * Core tests reported as "not in the system yet" when absent. A data-completeness
 * list only: it carries no gestational-age deadline and no clinical judgement.
 */
export const ANC_LAB_CORE_ITEMS: readonly AncLabCoreItem[] = [
  { id: 'hb_hct', labelTh: 'Hb / Hct', tests: ['HB', 'HCT'] },
  { id: 'hbsag', labelTh: 'HBsAg', tests: ['HBSAG'] },
  {
    id: 'syphilis',
    labelTh: 'ซิฟิลิส (VDRL / RPR / Treponemal)',
    tests: ['VDRL_RPR', 'TREPONEMAL', 'SYPHILIS_UNSPECIFIED'],
  },
  { id: 'hiv', labelTh: 'Anti-HIV', tests: ['HIV'] },
  { id: 'thal_screen', labelTh: 'MCV / OF', tests: ['MCV', 'OF'] },
  { id: 'dcip', labelTh: 'DCIP', tests: ['DCIP'] },
  { id: 'blood_group', labelTh: 'หมู่เลือด ABO', tests: ['BLOOD_GROUP'] },
  { id: 'rh', labelTh: 'Rh', tests: ['RH'] },
];

/**
 * Tests where a negative result is the notable one. Rh "positive" is the usual
 * result, so reading these like an infection screen would put a false alarm on
 * most women; the journey page's Rh tile has the same reading.
 */
export const ANC_LAB_NEGATIVE_IS_NOTABLE: readonly AncLabTest[] = ['RH'];

/** Beside an Rh word on the ANC form that the classifier would not read as a sign. */
export const ANC_LAB_RH_FORM_NOTE =
  'ข้อความนี้มาจากแบบบันทึก ANC บางโรงพยาบาลบันทึก negative หมายถึงไม่พบความผิดปกติ ไม่ใช่ Rh ลบ กรุณายืนยันจากผลห้องแล็บ';

/** On an HIV or syphilis tile the viewer's hospital may not read. Never "no result". */
export const ANC_LAB_SEROLOGY_WITHHELD_LABEL = 'จำกัดสิทธิ์';

/** Shown to every restricted viewer, so its presence does not hint at a result. */
export const ANC_LAB_SEROLOGY_WITHHELD_NOTE =
  'ผล HIV และซิฟิลิส รวมถึงปัจจัยเสี่ยงที่เกี่ยวข้อง แสดงเฉพาะโรงพยาบาลที่ผู้ป่วยฝากครรภ์และโรงพยาบาลที่ได้รับการส่งต่อ หากจำเป็นต้องทราบผล กรุณาติดต่อโรงพยาบาลที่ผู้ป่วยฝากครรภ์';

/** Grey covers numbers the panel does not assess and text it could not interpret. */
export const ANC_LAB_GREY_LEGEND =
  'สีเทาหมายถึงระบบไม่ได้ประเมินหรือแปลผลนี้ไม่ได้ กรุณาอ่านจากข้อความผลตรวจ ไม่ได้หมายความว่าผลปกติ';

/** Followed by the date. See ANC_LAB_STICKY_POSITIVE_TESTS: awaiting obstetric sign-off. */
export const ANC_LAB_EARLIER_POSITIVE_NOTE = 'พบผลบวกก่อนหน้านี้ในครรภ์นี้ เมื่อ';
export const ANC_LAB_EARLIER_POSITIVE_STATE = 'มีผลบวกก่อนหน้า';

/** lab_order.abnormal_result: HOSxP writes Y for abnormal; N or empty is not a flag. */
export const ANC_LAB_ABNORMAL_FLAG_VALUE = 'Y';

export const ANC_LAB_SOURCE_LABEL: Record<AncLabSource, string> = {
  anc_lab: 'ANC',
  lab_order: 'ห้องแล็บ',
  person_anc: 'ทะเบียน ANC',
};

export const ANC_LAB_ACCESS_DENIED = {
  message: 'ไม่มีสิทธิ์ดูผลตรวจของหญิงตั้งครรภ์รายนี้',
  remedy:
    'ผลตรวจเปิดให้เฉพาะโรงพยาบาลที่ผู้ป่วยฝากครรภ์ โรงพยาบาลที่ได้รับการส่งต่อ และโรงพยาบาลที่มีข้อมูลการดูแลผู้ป่วยรายนี้ กรุณาติดต่อโรงพยาบาลที่ผู้ป่วยฝากครรภ์เพื่อขอให้ส่งต่อมายังโรงพยาบาลของท่าน',
};

export const ANC_LAB_OWN_RESULTS_NOTICE =
  'แสดงเฉพาะผลตรวจของโรงพยาบาลนี้ ผลตรวจจากโรงพยาบาลอื่นจะดูได้เมื่อมีการส่งต่อผู้ป่วยรายนี้มายังโรงพยาบาลนี้ในระบบ';
