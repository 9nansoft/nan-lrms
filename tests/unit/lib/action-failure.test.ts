// tests/unit/lib/action-failure.test.ts
import { describe, it, expect } from 'vitest';
import { actionFailure, DEFAULT_ACTION_REMEDY } from '@/lib/action-failure';

describe('actionFailure', () => {
  it('names the action, keeps the server detail and says what to do', () => {
    expect(actionFailure('ลบ รพ.น่าน (10670)', 'hospital has data')).toEqual({
      message: 'ลบ รพ.น่าน (10670) ไม่สำเร็จ: hospital has data',
      remedy: DEFAULT_ACTION_REMEDY,
    });
  });
  it('joins a bare Thai verb without a space and omits an empty detail', () => {
    expect(actionFailure('บันทึก', '').message).toBe('บันทึกไม่สำเร็จ');
    expect(actionFailure('บันทึก', null).message).toBe('บันทึกไม่สำเร็จ');
  });
  it('accepts a specific remedy', () => {
    expect(actionFailure('บันทึก', null, 'กดเลือกอีกครั้ง').remedy).toBe('กดเลือกอีกครั้ง');
  });
  it('the default remedy is Thai and actionable', () => {
    expect(DEFAULT_ACTION_REMEDY).toBe(
      'ตรวจสอบการเชื่อมต่อเครือข่าย แล้วลองอีกครั้ง หากยังไม่สำเร็จ แจ้งผู้ดูแลระบบพร้อมข้อความนี้',
    );
  });
});
