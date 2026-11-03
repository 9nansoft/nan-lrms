import { describe, it, expect } from 'vitest';
import {
  HOSXP_SYNC_STATUS_TH,
  buildHosxpSyncReport,
  deriveHosxpSyncStatus,
  describeHosxpSyncDetail,
  describeHosxpSyncHelp,
  formatCounts,
  formatSyncTime,
  hosxpSyncTone,
  type HosxpSyncStatus,
} from '@/lib/hosxp-sync-status';
import type { OnboardHosxpSyncState } from '@/hooks/useOnboardHosxpSync';

const s = (o: Partial<OnboardHosxpSyncState> = {}): OnboardHosxpSyncState => ({ ran: true, ...o });

describe('deriveHosxpSyncStatus', () => {
  it.each<[OnboardHosxpSyncState | null, HosxpSyncStatus]>([
    [null, 'STARTING'],
    [s({ error: 'missing_bms_session' }), 'ERROR'],
    [s({ lastError: 'timeout' }), 'ERROR'],
    [s({ phase: 'failed' }), 'ERROR'],
    [s({ phase: 'querying_hosxp', error: 'x' }), 'ERROR'],
    [s({ phase: 'querying_hosxp' }), 'QUERYING'],
    [s({ started: true }), 'RUNNING'],
    [s({ alreadyRunning: true }), 'RUNNING'],
    [s({ ran: false }), 'SKIPPED'],
    [s(), 'STARTING'],
  ])('%o → %s', (state, expected) => {
    expect(deriveHosxpSyncStatus(state)).toBe(expected);
  });
});

describe('describeHosxpSyncDetail', () => {
  it('prefers the error, then lastError', () => {
    expect(describeHosxpSyncDetail(s({ error: 'e1', lastError: 'e2' }), 'ERROR')).toBe('e1');
    expect(describeHosxpSyncDetail(s({ lastError: 'e2' }), 'ERROR')).toBe('e2');
  });
  it('summarises cycles while running', () => {
    expect(describeHosxpSyncDetail(s({ successCount: 2, cycleCount: 3 }), 'RUNNING')).toBe(
      'scheduled · 2/3 cycles',
    );
  });
  it('names a skipped or starting loop', () => {
    expect(describeHosxpSyncDetail(s({ ran: false }), 'SKIPPED')).toBe('NO BMS SESSION');
    expect(describeHosxpSyncDetail(null, 'STARTING')).toBe('CONNECTING');
  });
});

describe('describeHosxpSyncHelp', () => {
  it.each([
    ['hospital_not_registered', 'โรงพยาบาลนี้ยังไม่ได้เปิดใช้งานในทะเบียน NN-LRMS'],
    ['missing_bms_session', 'ยังไม่ได้รับ BMS session จาก HOSxP launcher'],
    ['invalid_bms_url', 'BMS URL จาก session ไม่ถูกต้อง'],
    // 2026-10-22 รพ.พล: launched without a marketplace_token → sync silently
    // never ran while the chip said "กำลังเริ่ม". Now it says what to do.
    [
      'missing_marketplace_token',
      'เปิด NN-LRMS โดยไม่ได้รับ marketplace token จาก HOSxP จึงยังไม่ส่งข้อมูลเข้าจังหวัด — ปิดหน้านี้แล้วเปิดใหม่จากเมนู NN-LRMS ใน HOSxP',
    ],
    ['other', 'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ'],
  ])('error %s → actionable Thai help', (error, help) => {
    expect(describeHosxpSyncHelp(s({ error }), 'ERROR')).toBe(help);
  });
  it('a lastError-only ERROR points at the log, never "starting" (copy fix)', () => {
    expect(describeHosxpSyncHelp(s({ lastError: 'timeout' }), 'ERROR')).toBe(
      'ตรวจสอบรายละเอียดจาก server log หากข้อความด้านล่างยังไม่พอ',
    );
  });
  it('running and starting', () => {
    expect(describeHosxpSyncHelp(s({ started: true }), 'RUNNING')).toBe(
      'ระบบกำลังดึงข้อมูลจาก HOSxP เป็นรอบอัตโนมัติ',
    );
    expect(describeHosxpSyncHelp(null, 'STARTING')).toBe('ระบบกำลังเริ่มการเชื่อมต่อ HOSxP');
  });
});

describe('tone and Thai labels', () => {
  it('maps status to a tone', () => {
    expect(hosxpSyncTone('ERROR')).toBe('danger');
    expect(hosxpSyncTone('RUNNING')).toBe('ok');
    expect(hosxpSyncTone('QUERYING')).toBe('ok');
    expect(hosxpSyncTone('SKIPPED')).toBe('neutral');
  });
  it('every status has a Thai label', () => {
    for (const k of ['ERROR', 'QUERYING', 'RUNNING', 'SKIPPED', 'STARTING'] as const) {
      expect(HOSXP_SYNC_STATUS_TH[k]).toMatch(/[฀-๿]/);
    }
  });
});

describe('formatting and report', () => {
  it('formatSyncTime handles empty, unparseable and Bangkok time', () => {
    expect(formatSyncTime(null)).toBe('none yet');
    expect(formatSyncTime('garbage')).toBe('garbage');
    expect(formatSyncTime('2026-10-11T03:04:05Z')).toContain('10:04:05');
  });
  it('formatCounts joins key=value pairs', () => {
    expect(formatCounts({ rows: 4, upserted: 2 })).toBe('rows=4, upserted=2');
    expect(formatCounts(undefined)).toBe('');
  });
  it('report carries status, errors and the step log', () => {
    const state = s({
      error: 'boom',
      lastSteps: [
        {
          at: '2026-10-11T03:00:00Z',
          cycle: 3,
          name: 'fetch_ipt',
          status: 'success',
          message: 'ok',
          counts: { rows: 4 },
        },
      ],
    });
    const report = buildHosxpSyncReport(state, 'ERROR', 'help');
    expect(report).toContain('NN-LRMS HOSxP Sync Report');
    expect(report).toContain('STATUS: ERROR');
    expect(report).toContain('- error=boom');
    expect(report).toContain('- [2026-10-11T03:00:00Z] cycle=3 SUCCESS fetch_ipt: ok (rows=4)');
    expect(buildHosxpSyncReport(null, 'STARTING', 'h')).toContain('- no step log recorded yet');
  });
});
