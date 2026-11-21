// Self-test LINE notification — the "ทดสอบส่งข้อความ" button on the profile page.
//
// Sends ONE message to the caller's own CID through whatever transport is
// configured (bms | v3.1) and returns the outcome inline. This is the fastest
// way for a user to prove their LINE delivery works — and for an operator to
// see a transport-config problem — without staging a two-account consult test
// (the consult ping excludes the sender by design, so testing alone delivers
// nothing by construction).
//
// Deliberately NOT written to moph_alert_log: the clinical log is a
// dedup-keyed per-recipient audit of real alerts (constitution: the ONE
// authoritative record). A self-test has no case, and its outcome is returned
// to the caller directly — dual-writing would pollute the admin view.
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';
import { sendMophPrompt } from '@/services/moph-prompt';
import { sendMophTemplateAlert } from '@/services/moph-alert-v31';
import { resolveSessionIdForHospital } from '@/lib/bms-session';
import {
  mophAlertTransport,
  mophTemplateConfigured,
  type MophAlertTransport,
} from '@/config/moph-alert-config';

export interface SelfTestInput {
  /** ALWAYS the session user's own CID — the test goes to yourself. */
  cid: string;
  name: string;
  /** Session hospital code — the bms transport needs its tunnel. */
  hospitalCode: string;
}

export interface SelfTestResult {
  ok: boolean;
  transport: MophAlertTransport;
  /** Thai, user-facing outcome — rendered verbatim under the button. */
  detail: string;
  messageId: string | null;
}

/** The fixed test copy — identical content for both transports. */
function testMessage(name: string): {
  title: string;
  html: string;
  text: string;
} {
  const when = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  return {
    title: 'ข้อความทดสอบ — ระบบ LRMS',
    html:
      `<div><strong>ข้อความทดสอบแจ้งเตือน</strong></div>` +
      `<div>ระบบ LRMS ทดสอบการส่ง LINE ถึงคุณ${name}</div>` +
      `<div>เวลา: ${when}</div>` +
      `<div>หากได้รับข้อความนี้ แสดงว่าการแจ้งเตือนของท่านพร้อมใช้งาน</div>`,
    text:
      `ข้อความทดสอบแจ้งเตือน\n` +
      `ระบบ LRMS ทดสอบการส่ง LINE ถึงคุณ${name}\n` +
      `เวลา: ${when}\n` +
      `หากได้รับข้อความนี้ แสดงว่าการแจ้งเตือนของท่านพร้อมใช้งาน`,
  };
}

/** MophPromptError code → Thai, user-facing reason. */
function thaiReason(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : 'UNKNOWN';
  switch (code) {
    case 'AUTH':
      return 'API ปฏิเสธการยืนยันตัวตน (client-key/secret-key หรือ BMS session ไม่ถูกต้อง)';
    case 'VALIDATION':
      return 'API ปฏิเสธ template — ตรวจสอบว่า MOPH_ALERT_TEMPLATE ตรงกับชื่อที่ MOPH จดทะเบียน';
    case 'CLIENT_ERROR':
      return `API ปฏิเสธคำขอ (${code})`;
    case 'RETRYABLE_EXHAUSTED':
      return 'API ไม่ตอบสนองหลายครั้ง — ลองอีกครั้งภายหลัง หรือตรวจว่าเครื่องเข้าถึง morpromt2c.moph.go.th ได้';
    default:
      return `ส่งไม่สำเร็จ (${code})`;
  }
}

/**
 * Send one self-test message as the caller. Resolves with an ok/detail result
 * (never throws for send-level failures — the UI renders `detail` verbatim).
 */
export async function sendSelfTestNotification(
  db: DatabaseAdapter,
  input: SelfTestInput,
): Promise<SelfTestResult> {
  const transport = mophAlertTransport();
  const msg = testMessage(input.name);
  try {
    if (transport === 'v3.1') {
      if (!mophTemplateConfigured()) {
        return {
          ok: false,
          transport,
          detail:
            'ระบบยังไม่พร้อมส่ง: ต้องตั้งค่า MOPH_ALERT_TEMPLATE (ชื่อ template ที่ MOPH จดทะเบียน) ' +
            'และ MOPH_ALERT_CLIENT_KEY / MOPH_ALERT_SECRET_KEY ก่อน — แจ้งผู้ดูแลระบบ',
          messageId: null,
        };
      }
      const res = await sendMophTemplateAlert({
        cid: input.cid,
        name: input.name,
        messageTitle: msg.title,
        messageHtml: msg.html,
        messageText: msg.text,
      });
      if (!res.success) {
        return {
          ok: false,
          transport,
          detail: 'API ตอบรับ แต่แจ้งว่าส่งไม่สำเร็จ — แจ้งผู้ดูแลระบบพร้อมเวลาที่ทดสอบ',
          messageId: res.messageId,
        };
      }
      return {
        ok: true,
        transport,
        detail: 'ส่งสำเร็จ — ตรวจสอบ LINE ของท่าน (อาจใช้เวลาไม่กี่วินาที)',
        messageId: res.messageId,
      };
    }

    // bms transport: the alert drain re-derives a per-hospital session; the
    // self-test does the same so the failure mode (no tunnel) surfaces HERE,
    // in the user's hand, instead of silently eating clinical alerts later.
    let sessionId: string;
    try {
      const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
        input.hospitalCode,
      ]);
      sessionId = await resolveSessionIdForHospital(db, rows[0]?.id ?? '');
    } catch (error) {
      logger.warn('notification_self_test_no_session', { hospitalCode: input.hospitalCode });
      return {
        ok: false,
        transport,
        detail:
          'โรงพยาบาลของท่านยังไม่มี BMS session/tunnel ที่ใช้ได้ จึงส่ง LINE ไม่ได้ — ' +
          'แจ้งผู้ดูแลระบบ หรือรอเปิดใช้ MOPH Alert v3.1 (ไม่ต้องใช้ tunnel)',
        messageId: null,
      };
    }
    const res = await sendMophPrompt({
      sessionId,
      cid: input.cid,
      title: msg.title,
      text: msg.text,
    });
    if (res.line.status === 'success') {
      return {
        ok: true,
        transport,
        detail: 'ส่งสำเร็จ — ตรวจสอบ LINE ของท่าน (อาจใช้เวลาไม่กี่วินาที)',
        messageId: res.messageId,
      };
    }
    return {
      ok: false,
      transport,
      detail:
        res.line.status === 'skipped'
          ? 'API ข้ามการส่ง (skipped) — ผู้รับอาจยังไม่ผูก LINE หมอพร้อม'
          : 'API แจ้งว่าส่งไม่สำเร็จ (failed) — แจ้งผู้ดูแลระบบพร้อมเวลาที่ทดสอบ',
      messageId: res.messageId,
    };
  } catch (error) {
    // Duck-typed .code (see moph-alert-drain.ts) — resilient under mocks too.
    const detail = thaiReason(error);
    logger.warn('notification_self_test_failed', {
      transport,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, transport, detail, messageId: null };
  }
}
