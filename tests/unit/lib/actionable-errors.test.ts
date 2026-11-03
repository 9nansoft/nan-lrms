// tests/unit/lib/actionable-errors.test.ts
import { describe, it, expect } from 'vitest';
import {
  describeBmsSessionError,
  describePatientLoadError,
  describeWardFeedError,
  describeWardFeedStale,
} from '@/lib/actionable-errors';

describe('describeBmsSessionError — every message bms-browser-client can throw', () => {
  it.each([
    ['BMS session response missing bms_url', 'เซสชัน HOSxP ไม่มีที่อยู่เซิร์ฟเวอร์ BMS ของโรงพยาบาล', 'bms_url'],
    [
      'BMS session response missing bearer token (bms_session_code/key_value)',
      'เซสชัน HOSxP ไม่มีรหัสยืนยันตัวตน',
      'bms_session_code',
    ],
    ['BMS session retrieval failed (HTTP 401): expired', 'ไม่พบเซสชัน HOSxP หรือเซสชันหมดอายุ', 'ลิงก์เดิม'],
    ['BMS session retrieval failed (HTTP 503): down', 'บริการเซสชัน HOSxP ขัดข้องชั่วคราว', '5 นาที'],
    ['BMS session retrieval timed out after 30 seconds', 'เชื่อมต่อบริการเซสชัน HOSxP ไม่ทันเวลา (30 วินาที)', 'อินเทอร์เน็ต'],
    ['Cannot connect to BMS session API: Failed to fetch', 'เชื่อมต่อบริการเซสชัน HOSxP ไม่ได้', 'ไฟร์วอลล์'],
    ['something unexpected', 'เปิดเซสชัน HOSxP ไม่สำเร็จ', 'แจ้งผู้ดูแลระบบ'],
  ])('%s', (raw, message, remedyHint) => {
    const e = describeBmsSessionError(raw);
    expect(e.message).toBe(message);
    expect(e.remedy).toContain(remedyHint);
    expect(e.remedy).toContain('HOSxP');
    expect(e.detail).toBe(raw); // raw text stays available for IT
  });

  it('never surfaces the raw English sentence as the headline', () => {
    expect(describeBmsSessionError('BMS session response missing bms_url').message).not.toMatch(
      /missing|response|session/i,
    );
  });
});

describe('ward feed errors', () => {
  it('initial failure keeps the old headline words and adds a remedy + raw detail', () => {
    const e = describeWardFeedError(new Error('BMS unavailable'));
    expect(e.message).toBe('ไม่สามารถโหลดข้อมูลห้องคลอดจาก HOSxP');
    expect(e.remedy).toContain('ลองใหม่');
    expect(e.detail).toBe('BMS unavailable');
  });

  it('stale banner quotes the real refresh cadence', () => {
    expect(describeWardFeedStale(20)).toEqual({
      message: 'ดึงข้อมูลเตียงจาก HOSxP ไม่สำเร็จ — แสดงข้อมูลเดิม',
      remedy: 'ระบบจะลองใหม่อัตโนมัติทุก 20 วินาที หรือกด ลองใหม่ หากยังไม่ได้ ตรวจสอบว่าเครื่อง HOSxP ของโรงพยาบาลเปิดอยู่',
    });
  });
});

describe('describeWardFeedError — what / since when / what to do (C1)', () => {
  it('names the feed that failed and when the failure began', () => {
    const e = describeWardFeedError(new Error('HTTP 500'), { feed: 'occupancy', since: '2026-10-11T03:42:00Z' });
    expect(e.message).toBe(
      'ไม่สามารถโหลดข้อมูลห้องคลอดจาก HOSxP — รายชื่อผู้คลอดบนเตียง · ล้มเหลวตั้งแต่ 11 ต.ค. 2569 10:42 น.',
    );
    expect(e.detail).toBe('HTTP 500');
  });

  it('bed/patient feeds warn the nurse not to read the failure as an empty ward', () => {
    for (const feed of ['beds', 'occupancy'] as const) {
      const e = describeWardFeedError(new Error('x'), { feed });
      expect(e.remedy).toContain('ลองใหม่');
      expect(e.remedy).toContain('อย่าถือว่าห้องคลอดว่าง');
    }
    expect(describeWardFeedError(new Error('x'), { feed: 'beds' }).message).toContain('ผังเตียง');
    expect(describeWardFeedError(new Error('x'), { feed: 'wards' }).message).toContain('รายการวอร์ดห้องคลอด');
  });
});

describe('describePatientLoadError', () => {
  const err = (status: number, message = 'x') => Object.assign(new Error(message), { status });
  it('400 → link format, with the composite example', () => {
    const e = describePatientLoadError(err(400, 'Invalid patient ID format'));
    expect(e.message).toBe('รูปแบบรหัสผู้คลอดในลิงก์ไม่ถูกต้อง');
    expect(e.remedy).toContain('/patients/10670-69000123');
    expect(e.detail).toBe('Invalid patient ID format');
  });
  it('404 → not found, wait for the next sync', () => {
    expect(describePatientLoadError(err(404)).message).toBe('ไม่พบข้อมูลผู้คลอดรายนี้');
    expect(describePatientLoadError(err(404)).remedy).toContain('30 วินาที');
  });
  it('anything else → network remedy', () => {
    expect(describePatientLoadError(err(500)).message).toBe('โหลดข้อมูลผู้คลอดไม่สำเร็จ');
    expect(describePatientLoadError(null).message).toBe('โหลดข้อมูลผู้คลอดไม่สำเร็จ');
  });
});
