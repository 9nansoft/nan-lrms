// Notification event catalog — the single source of truth for which events
// exist, how urgently they are delivered, and whether they may carry patient
// detail. Spec: docs/superpowers/specs/2026-08-07-notification-events-design.md
//
// `implemented` is deliberate: an event with no producer must never appear as a
// checkbox, or the UI promises a notification that can never arrive.

export type NotificationEventTier = 'urgent' | 'digest';
export type NotificationEventDetail = 'patient' | 'aggregate';

export interface NotificationEvent {
  /** Stored in moph_alert_log.alert_source — the dedup index already covers it. */
  key: string;
  tier: NotificationEventTier;
  /** 'aggregate' events NEVER carry a patient identifier, at any detail level. */
  detail: NotificationEventDetail;
  labelTh: string;
  descriptionTh: string;
  /** False until a producer exists. Hidden from the UI while false. */
  implemented: boolean;
}

export const NOTIFICATION_EVENTS: readonly NotificationEvent[] = [
  {
    key: 'anc_hr3',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ครรภ์เสี่ยงสูง (ANC HR3)',
    descriptionTh: 'พบหญิงตั้งครรภ์ที่จัดเป็นความเสี่ยงสูงระดับ HR3',
    implemented: true,
  },
  {
    key: 'labor_emergency',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ภาวะฉุกเฉินในห้องคลอด',
    descriptionTh: 'ผลคัดกรองแรกรับเข้าเกณฑ์ฉุกเฉิน ต้องรายงานทันที',
    implemented: true,
  },
  {
    key: 'partograph_critical',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'Partograph วิกฤต',
    descriptionTh: 'กราฟการคลอดข้าม action line หรือ CDSS แจ้งระดับ CRITICAL',
    implemented: false,
  },
  {
    key: 'cpd_high',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'คะแนน CPD เสี่ยงสูง',
    descriptionTh: 'ผู้คลอดมีคะแนน CPD ถึงเกณฑ์เสี่ยงสูง',
    implemented: false,
  },
  {
    key: 'referral_incoming',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'มีเคสส่งต่อเข้ามา',
    descriptionTh: 'มีการส่งต่อผู้ป่วยมายังโรงพยาบาลนี้',
    implemented: false,
  },
  {
    key: 'referral_overdue',
    tier: 'urgent',
    detail: 'patient',
    labelTh: 'ใบส่งต่อค้างเกินเวลา',
    descriptionTh: 'ใบส่งต่อที่ยังไม่ได้รับการตอบรับเกินเกณฑ์เวลา',
    implemented: false,
  },
  {
    key: 'anc_overdue',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ANC ขาดนัด',
    descriptionTh: 'หญิงตั้งครรภ์ที่ไม่มาตามนัดเกินเกณฑ์',
    implemented: false,
  },
  {
    key: 'edc_due_soon',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ใกล้ครบกำหนดคลอด',
    descriptionTh: 'ครรภ์ที่ใกล้ถึงกำหนดคลอดในช่วงที่กำหนด',
    implemented: false,
  },
  {
    key: 'outcome_abnormal',
    tier: 'digest',
    detail: 'patient',
    labelTh: 'ผลลัพธ์การคลอดผิดปกติ',
    descriptionTh: 'ทารกแรกเกิด APGAR ต่ำ หรือน้ำหนักน้อยกว่าเกณฑ์',
    implemented: false,
  },
  {
    key: 'sync_offline',
    tier: 'digest',
    detail: 'aggregate',
    labelTh: 'การเชื่อมต่อข้อมูลขัดข้อง',
    descriptionTh: 'โรงพยาบาลหยุดส่งข้อมูลเข้าระบบ (ไม่มีข้อมูลผู้ป่วย)',
    implemented: false,
  },
] as const;

export function notificationEventKeys(): string[] {
  return NOTIFICATION_EVENTS.map((e) => e.key);
}

export function findNotificationEvent(key: string): NotificationEvent | null {
  return NOTIFICATION_EVENTS.find((e) => e.key === key) ?? null;
}

export function implementedNotificationEvents(): NotificationEvent[] {
  return NOTIFICATION_EVENTS.filter((e) => e.implemented);
}
