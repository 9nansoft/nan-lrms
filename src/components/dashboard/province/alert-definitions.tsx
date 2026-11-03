// One definition per dashboard alert tile, read by the kiosk ribbon (AlertBar,
// frozen English labels) and by normal mode (AlertsSection, Thai labels).
// hrefs, test ids and tooltip copy live here once so the two modes cannot
// drift, and every threshold in the copy comes from the config the server
// queries use (DashboardAlerts docs in src/types/api.ts).
import type { ReactNode } from 'react';
import type { DashboardAlerts } from '@/types/api';
import { ANC_OPS } from '@/config/anc-ops';
import { REFERRAL_SLA } from '@/config/referral-sla';
import { ANC_LAST_VISIT_MAX_AGE_DAYS } from '@/config/anc-freshness';

export interface AlertDefinition {
  key: keyof DashboardAlerts;
  testId: string;
  href: string;
  /** Normal-mode Thai label. */
  label: string;
  /** Kiosk ribbon label — the kiosk is not redesigned in sub-project 2. */
  kioskLabel: string;
  /** Kiosk ribbon detail line when the count is above zero. */
  kioskDetail: string;
  /** Kiosk ribbon text when the count is zero (frozen). */
  zeroLabel: string;
  /** Normal-mode text when the count is zero — says what was checked. */
  zeroLabelTh: string;
  tooltipTitle: string;
  /** Kiosk tooltip body (frozen). */
  tooltipBody: ReactNode;
  /** Normal-mode tooltip body: states what the number counts, no release notes. */
  tooltipBodyTh: ReactNode;
  /** `alarm` counts toward the alert total and turns red; `workload` is
   *  upcoming work (amber) and never raises the total on its own. */
  kind: 'alarm' | 'workload';
}

export const ALERT_DEFINITIONS: readonly AlertDefinition[] = [
  {
    key: 'referralAlerts',
    testId: 'alert-referrals',
    href: '/referrals?overdue=1',
    label: 'ส่งต่อที่ต้องเร่งจัดการ',
    kioskLabel: 'REFERRAL ACTION',
    kioskDetail: 'เกิน SLA / ฉุกเฉินยังไม่ถึง',
    zeroLabel: 'ไม่มีส่งต่อค้างเกิน SLA',
    zeroLabelTh: 'ไม่มีส่งต่อค้างเกิน SLA',
    tooltipTitle: 'เคสส่งต่อที่ต้องเร่งจัดการ',
    tooltipBody: (
      <>
        เคสส่งต่อสถานะ <strong>INITIATED</strong> ค้างเกิน{' '}
        <strong>{REFERRAL_SLA.overdueAfterHours} ชั่วโมง</strong> รวมกับเคส{' '}
        <strong>ฉุกเฉิน (EMERGENCY)</strong> ที่ยังไม่ถึงปลายทาง. ต่างจากเดิมที่นับเคสรอทั้งหมด
        (ตัวเลขไม่เคยลด) — ช่องนี้จะเป็นศูนย์ได้เมื่อจัดการทัน. คลิกเพื่อเปิดรายการที่กรองแล้ว.
      </>
    ),
    tooltipBodyTh: (
      <>
        เคสส่งต่อสถานะ <strong>INITIATED</strong> ค้างเกิน{' '}
        <strong>{REFERRAL_SLA.overdueAfterHours} ชั่วโมง</strong> รวมกับเคส{' '}
        <strong>ฉุกเฉิน (EMERGENCY)</strong> ที่ยังไม่ถึงปลายทาง. ช่องนี้เป็นศูนย์ได้เมื่อจัดการทัน.
        คลิกเพื่อเปิดรายการที่กรองแล้ว.
      </>
    ),
    kind: 'alarm',
  },
  {
    key: 'overdueAnc',
    testId: 'alert-overdue-anc',
    href: '/pregnancies?cohort=anc_stale',
    label: `ขาดนัด ANC เกิน ${ANC_OPS.followupWarnDays} วัน`,
    kioskLabel: 'OVERDUE ANC',
    kioskDetail: `ขาดนัดเกิน ${ANC_OPS.followupWarnDays} วัน`,
    zeroLabel: 'ANC ครบทุกราย',
    zeroLabelTh: `ไม่มีขาดนัดเกิน ${ANC_OPS.followupWarnDays} วัน`,
    tooltipTitle: 'หญิงตั้งครรภ์ขาดนัด ANC เกินเกณฑ์',
    tooltipBody: (
      <>
        นับเฉพาะทะเบียนครรภ์ที่ยัง active (ตัดรายคลอดแล้ว/หลุดติดตามออก เช่นเดียวกับหน้า
        ฝากครรภ์) ที่นัดล่าสุดผ่านมาเกิน <strong>{ANC_OPS.followupWarnDays} วัน</strong> —
        ตัวเลขเดียวกับช่อง MISSED ANC ของหน้าฝากครรภ์. ปฏิบัติ:
        ติดตามให้กลับมาตรวจครรภ์ก่อนหลุดการติดตามที่ {ANC_LAST_VISIT_MAX_AGE_DAYS} วัน.
      </>
    ),
    tooltipBodyTh: (
      <>
        นับเฉพาะทะเบียนครรภ์ที่ยัง active (ตัดรายคลอดแล้ว/หลุดติดตามออก เช่นเดียวกับหน้า
        ฝากครรภ์) ที่นัดล่าสุดผ่านมาเกิน <strong>{ANC_OPS.followupWarnDays} วัน</strong> —
        ตัวเลขเดียวกับช่อง MISSED ANC ของหน้าฝากครรภ์. ปฏิบัติ:
        ติดตามให้กลับมาตรวจครรภ์ก่อนหลุดการติดตามที่ {ANC_LAST_VISIT_MAX_AGE_DAYS} วัน.
      </>
    ),
    kind: 'alarm',
  },
  {
    key: 'dueSoon',
    testId: 'alert-due-soon',
    href: '/pregnancies?cohort=due_soon',
    label: `ใกล้ครบกำหนดคลอด ≤${ANC_OPS.dueSoonDays} วัน`,
    kioskLabel: `DUE ≤${ANC_OPS.dueSoonDays} DAYS`,
    kioskDetail: 'ใกล้ครบกำหนดคลอด',
    zeroLabel: 'ไม่มีครรภ์ใกล้คลอด',
    zeroLabelTh: 'ไม่มีครรภ์ใกล้คลอด',
    tooltipTitle: `ครรภ์ครบกำหนดภายใน ${ANC_OPS.dueSoonDays} วัน`,
    tooltipBody: (
      <>
        หญิงตั้งครรภ์ในทะเบียน active ที่ EDC อยู่ภายใน <strong>{ANC_OPS.dueSoonDays} วัน</strong>{' '}
        (รวมที่เลยกำหนดแล้ว) — ภาระงานคลอดที่กำลังมาถึงของทั้งจังหวัด ใช้วางแผนเตียง/ส่งต่อ.
        แทนที่ช่อง IN-TRANSIT เดิมซึ่งเป็นศูนย์ตลอดเพราะสถานะส่งต่อไม่ถูกอัปเดตจากต้นทาง.
      </>
    ),
    tooltipBodyTh: (
      <>
        หญิงตั้งครรภ์ในทะเบียน active ที่ EDC อยู่ภายใน <strong>{ANC_OPS.dueSoonDays} วัน</strong>{' '}
        (รวมที่เลยกำหนดแล้ว) — ภาระงานคลอดที่กำลังมาถึงของทั้งจังหวัด ใช้วางแผนเตียง/ส่งต่อ.
      </>
    ),
    kind: 'workload',
  },
];

/** Only true alarms feed the headline total — due-soon is upcoming workload. */
export function alarmTotal(alerts: DashboardAlerts): number {
  return ALERT_DEFINITIONS.filter((d) => d.kind === 'alarm').reduce((sum, d) => sum + alerts[d.key], 0);
}
