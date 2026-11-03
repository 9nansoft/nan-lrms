// tests/unit/config/sync-run-status.test.ts
import { describe, it, expect } from 'vitest';
import { SYNC_OUTCOME_META, SYNC_STEP_TONE, formatSyncDuration, syncTriggerLabel, SYNC_OVERVIEW_POLL_MS } from '@/config/sync-run-status';

describe('sync-run-status', () => {
  it('every outcome has a Thai label and a tone', () => {
    expect(SYNC_OUTCOME_META).toEqual({
      success: { labelTh: 'สำเร็จ', tone: 'ok' },
      partial: { labelTh: 'สำเร็จบางส่วน', tone: 'warn' },
      failed: { labelTh: 'ล้มเหลว', tone: 'danger' },
      running: { labelTh: 'กำลังซิงค์', tone: 'brand' },
      never: { labelTh: 'ยังไม่เคยซิงค์', tone: 'neutral' },
    });
  });
  it('step tones follow the same scale', () => {
    expect(SYNC_STEP_TONE).toEqual({ success: 'ok', warning: 'warn', error: 'danger', info: 'neutral', running: 'brand' });
  });
  it('triggers read in Thai; unknown codes pass through', () => {
    expect(syncTriggerLabel('scheduled')).toBe('ตามรอบ');
    expect(syncTriggerLabel('immediate')).toBe('สั่งทันที');
    expect(syncTriggerLabel('onboarding')).toBe('เริ่มใช้งาน');
    expect(syncTriggerLabel('manual-x')).toBe('manual-x');
    expect(syncTriggerLabel(null)).toBe('—');
  });
  it('durations', () => {
    expect(formatSyncDuration(null)).toBe('—');
    expect(formatSyncDuration(850)).toBe('850 มิลลิวินาที');
    expect(formatSyncDuration(2100)).toBe('2.1 วินาที');
  });
  it('the overview refresh interval is the value the copy quotes', () => {
    expect(SYNC_OVERVIEW_POLL_MS).toBe(15_000);
  });
});
