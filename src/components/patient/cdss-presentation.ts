// Shared presentation tokens for partograph CDSS severity/section labelling.
// Imported by AlertSummaryPanel, PartogramChart header, and HighRiskPatientList severity dot.
import type { CdssSeverity, CdssSection } from '@/types/api';

export const SEVERITY_DOT: Record<CdssSeverity, string> = {
  CRITICAL: 'bg-red-500',
  ALERT: 'bg-orange-500',
  WARN: 'bg-amber-400',
  INFO: 'bg-slate-400',
};

export const SEVERITY_LABEL_TH: Record<CdssSeverity, string> = {
  CRITICAL: 'วิกฤต',
  ALERT: 'เตือน',
  WARN: 'ระวัง',
  INFO: 'ข้อมูล',
};

export const SECTION_LABEL_TH: Record<CdssSection, string> = {
  FHR: 'เสียงหัวใจทารก',
  LIQUOR: 'น้ำคร่ำ',
  MOULDING: 'กะโหลกเกยกัน',
  CERVIX: 'ปากมดลูก',
  DESCENT: 'การลดต่ำศีรษะ',
  CONTRACTIONS: 'การหดรัดตัว',
  OXY: 'ออกซิโทซิน',
  PULSE: 'ชีพจร',
  BP: 'ความดันโลหิต',
  TEMP: 'อุณหภูมิ',
  URINE: 'ปัสสาวะ',
  TIME: 'เวลาสังเกต',
};

export const SEVERITY_RANK: Record<CdssSeverity, number> = {
  CRITICAL: 3,
  ALERT: 2,
  WARN: 1,
  INFO: 0,
};

/** Severity display order — CRITICAL first, INFO last. */
export const SEVERITY_DISPLAY_ORDER: CdssSeverity[] = ['CRITICAL', 'ALERT', 'WARN', 'INFO'];
