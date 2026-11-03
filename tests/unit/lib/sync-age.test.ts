import { describe, it, expect } from 'vitest';
import { describeSyncAge } from '@/lib/sync-age';

const NOW = new Date('2026-10-11T05:40:00Z'); // 12:40 Bangkok

describe('describeSyncAge', () => {
  it('fresh sync → ok, Bangkok clock, minutes ago', () => {
    expect(describeSyncAge('2026-10-11T05:38:00Z', 'OK', NOW)).toEqual({
      health: 'ok', tone: 'ok', clock: '12:38', relative: '2 นาทีที่แล้ว',
    });
  });
  it('under a minute → เมื่อสักครู่', () => {
    expect(describeSyncAge('2026-10-11T05:39:30Z', 'OK', NOW).relative).toBe('เมื่อสักครู่');
  });
  it('over 60 minutes → stale/warn in hours', () => {
    const a = describeSyncAge('2026-10-11T03:10:00Z', 'OK', NOW);
    expect(a).toMatchObject({ health: 'stale', tone: 'warn', relative: '2 ชั่วโมงที่แล้ว' });
  });
  it('over 24 hours → critical/danger, clock includes the Thai date', () => {
    const a = describeSyncAge('2026-09-23T03:02:00Z', 'OK', NOW);
    expect(a).toMatchObject({ health: 'critical', tone: 'danger', relative: '18 วันที่แล้ว' });
    expect(a.clock).toBe('23 ก.ย. 10:02');
  });
  it.each([null, undefined, '', 'not-a-date'])('missing/unparseable %p → never, no NaN', (v) => {
    const a = describeSyncAge(v as string | null | undefined, 'OK', NOW);
    expect(a).toEqual({ health: 'never', tone: 'danger', clock: null, relative: 'ยังไม่เคยซิงค์' });
  });
  it('future-dated sync → warn with a clock-skew hint, never a negative age', () => {
    const a = describeSyncAge('2026-10-11T06:40:00Z', 'OK', NOW);
    expect(a.tone).toBe('warn');
    expect(a.relative).toBe('เวลาซิงค์ล่วงหน้า — ตรวจสอบนาฬิกาเครื่อง');
    expect(a.relative).not.toMatch(/-|NaN/);
  });
  it('BLOCKED status → danger regardless of age', () => {
    expect(describeSyncAge('2026-10-11T05:38:00Z', 'BLOCKED', NOW).tone).toBe('danger');
  });
});
