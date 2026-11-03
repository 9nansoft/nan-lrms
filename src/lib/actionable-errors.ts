// src/lib/actionable-errors.ts
// Turns raw failures into actionable Thai for ErrorState: what happened
// (message), what to do (remedy) and the raw text for IT (detail). Pure.
// Constitution V: every user-facing error says what went wrong AND what to do.
import { formatBangkokStamp } from '@/lib/bangkok-time';

export interface ActionableError {
  message: string;
  remedy: string;
  detail?: string;
}

/** Generic remedy for a failed load — shared by every ErrorState that has no more specific advice. */
export const NETWORK_RETRY_REMEDY =
  'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบ';

const REOPEN = 'ปิดหน้านี้แล้วเปิด NN-LRMS จากเมนูใน HOSxP ใหม่อีกครั้งเพื่อสร้างเซสชันใหม่';

function errorText(err: unknown): string | undefined {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return undefined;
}

/** Messages thrown by retrieveBmsSession / extractConnectionConfig
 *  (src/lib/bms-browser-client.ts). Match on stable fragments, not full text. */
export function describeBmsSessionError(raw: string): ActionableError {
  const detail = raw;
  if (/missing bms_url/i.test(raw)) {
    return {
      message: 'เซสชัน HOSxP ไม่มีที่อยู่เซิร์ฟเวอร์ BMS ของโรงพยาบาล',
      remedy: `${REOPEN} หากยังพบข้อความนี้ แจ้งผู้ดูแล HOSxP ของโรงพยาบาลให้ตรวจการตั้งค่า BMS Session API (bms_url)`,
      detail,
    };
  }
  if (/missing bearer token/i.test(raw)) {
    return {
      message: 'เซสชัน HOSxP ไม่มีรหัสยืนยันตัวตน',
      remedy: `${REOPEN} หากยังพบข้อความนี้ แจ้งผู้ดูแล HOSxP ของโรงพยาบาลให้ตรวจการตั้งค่า BMS Session API (bms_session_code)`,
      detail,
    };
  }
  const http = raw.match(/retrieval failed \(HTTP (\d{3})\)/i);
  if (http) {
    return Number(http[1]) >= 500
      ? {
          message: 'บริการเซสชัน HOSxP ขัดข้องชั่วคราว',
          remedy: 'รอสักครู่แล้วเปิด NN-LRMS จากเมนูใน HOSxP ใหม่ หากเกิน 5 นาทียังไม่ได้ แจ้งผู้ดูแลระบบ',
          detail,
        }
      : {
          message: 'ไม่พบเซสชัน HOSxP หรือเซสชันหมดอายุ',
          remedy: 'เปิด NN-LRMS จากเมนูใน HOSxP ใหม่อีกครั้ง (ลิงก์เดิมใช้ซ้ำไม่ได้หลังหมดอายุ)',
          detail,
        };
  }
  if (/timed out/i.test(raw)) {
    return {
      message: 'เชื่อมต่อบริการเซสชัน HOSxP ไม่ทันเวลา (30 วินาที)',
      remedy: 'ตรวจสอบอินเทอร์เน็ตของเครื่องนี้ แล้วเปิด NN-LRMS จากเมนูใน HOSxP ใหม่',
      detail,
    };
  }
  if (/cannot connect/i.test(raw)) {
    return {
      message: 'เชื่อมต่อบริการเซสชัน HOSxP ไม่ได้',
      remedy: 'ตรวจสอบอินเทอร์เน็ตหรือไฟร์วอลล์ของเครื่องนี้ แล้วเปิด NN-LRMS จากเมนูใน HOSxP ใหม่',
      detail,
    };
  }
  return {
    message: 'เปิดเซสชัน HOSxP ไม่สำเร็จ',
    remedy: 'เปิด NN-LRMS จากเมนูใน HOSxP ใหม่อีกครั้ง หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความด้านล่าง',
    detail,
  };
}

/** The three HOSxP feeds behind the ward board. */
export type WardFeed = 'wards' | 'beds' | 'occupancy';

const WARD_FEED_LABEL_TH: Record<WardFeed, string> = {
  wards: 'รายการวอร์ดห้องคลอด',
  beds: 'ผังเตียง',
  occupancy: 'รายชื่อผู้คลอดบนเตียง',
};

/** A failed bed or patient feed means "unknown", never "empty". */
const NOT_EMPTY_WARNING = 'ระหว่างนี้อย่าถือว่าห้องคลอดว่าง — ตรวจรายชื่อผู้คลอดใน HOSxP โดยตรง';

/**
 * The first ward/bed load failed: nothing cached to show. Says what failed
 * (`feed`), since when (`since`, ISO, when known) and what to do.
 */
export function describeWardFeedError(
  err: unknown,
  opts: { feed?: WardFeed; since?: string | null } = {},
): ActionableError {
  const { feed, since } = opts;
  const sinceDate = since ? new Date(since) : null;
  const parts = ['ไม่สามารถโหลดข้อมูลห้องคลอดจาก HOSxP'];
  if (feed) parts.push(` — ${WARD_FEED_LABEL_TH[feed]}`);
  if (sinceDate && Number.isFinite(sinceDate.getTime())) parts.push(` · ล้มเหลวตั้งแต่ ${formatBangkokStamp(sinceDate)}`);
  const base =
    'ตรวจสอบว่าเครื่อง HOSxP หรือ BMS ของโรงพยาบาลเปิดอยู่และเชื่อมต่ออินเทอร์เน็ตได้ แล้วกด ลองใหม่ หากยังไม่ได้ แจ้งผู้ดูแลระบบพร้อมข้อความด้านล่าง';
  return {
    message: parts.join(''),
    remedy: feed === 'beds' || feed === 'occupancy' ? `${base} · ${NOT_EMPTY_WARNING}` : base,
    detail: errorText(err),
  };
}

/** A refresh failed while the board still shows the last good data. */
export function describeWardFeedStale(refreshSeconds: number): { message: string; remedy: string } {
  return {
    message: 'ดึงข้อมูลเตียงจาก HOSxP ไม่สำเร็จ — แสดงข้อมูลเดิม',
    remedy: `ระบบจะลองใหม่อัตโนมัติทุก ${refreshSeconds} วินาที หรือกด ลองใหม่ หากยังไม่ได้ ตรวจสอบว่าเครื่อง HOSxP ของโรงพยาบาลเปิดอยู่`,
  };
}

/** /api/patients/[an] failures (FetchError carries `status`). */
export function describePatientLoadError(err: unknown): ActionableError {
  const status =
    err && typeof err === 'object' && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? (err as { status: number }).status
      : null;
  const detail = errorText(err);
  if (status === 400) {
    return {
      message: 'รูปแบบรหัสผู้คลอดในลิงก์ไม่ถูกต้อง',
      remedy: 'เปิดผู้คลอดจากแดชบอร์ดหรือหน้ารายชื่อ — ลิงก์ต้องเป็น /patients/<รหัส รพ.>-<AN> เช่น /patients/10670-69000123',
      detail,
    };
  }
  if (status === 404) {
    return {
      message: 'ไม่พบข้อมูลผู้คลอดรายนี้',
      remedy:
        'ผู้คลอดอาจจำหน่ายแล้วหรือยังไม่ซิงค์จาก HOSxP — ตรวจ AN แล้วกด ลองใหม่ หลังรอบซิงค์ถัดไป (ประมาณ 30 วินาที)',
      detail,
    };
  }
  return {
    message: 'โหลดข้อมูลผู้คลอดไม่สำเร็จ',
    remedy: NETWORK_RETRY_REMEDY,
    detail,
  };
}
