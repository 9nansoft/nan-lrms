import { describe, it, expect } from 'vitest';
import { deriveSyncStatus } from '@/services/dashboard';

const base = { has_bms_config: true, last_authenticity_status: null, data_purged_at: null, last_sync_at: '2026-10-11T05:00:00Z' };

describe('deriveSyncStatus', () => {
  it('purged -> BLOCKED with reason', () => {
    expect(deriveSyncStatus({ ...base, data_purged_at: '2026-10-10T00:00:00Z' })).toEqual({
      syncStatus: 'BLOCKED',
      syncBlockedReason: 'purged_pending_reonboard',
    });
  });
  it('authenticity failure -> BLOCKED', () => {
    expect(deriveSyncStatus({ ...base, last_authenticity_status: 'cid_unstable' })).toEqual({
      syncStatus: 'BLOCKED',
      syncBlockedReason: 'cid_unstable',
    });
  });
  it('no recorded sync -> NEVER_SYNCED, with or without a BMS config row', () => {
    expect(deriveSyncStatus({ ...base, last_sync_at: null }).syncStatus).toBe('NEVER_SYNCED');
    expect(deriveSyncStatus({ ...base, has_bms_config: false, last_sync_at: null }).syncStatus).toBe('NEVER_SYNCED');
  });
  it('no BMS config row but a recorded sync -> OK (webhook-only hospitals sync without a BMS config; 1 such live hospital on 2026-10-11)', () => {
    expect(deriveSyncStatus({ ...base, has_bms_config: false }).syncStatus).toBe('OK');
    expect(deriveSyncStatus({ ...base, has_bms_config: 0 }).syncStatus).toBe('OK');
  });
  it('otherwise OK', () => {
    expect(deriveSyncStatus({ ...base, has_bms_config: 1 })).toEqual({ syncStatus: 'OK', syncBlockedReason: null });
  });
});
