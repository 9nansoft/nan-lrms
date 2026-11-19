// Why a hospital shows no rows.
//
// "No patients" and "we never synced" look the same on an empty table, and
// the fix is different in each case. The note says WHICH.
import { describe, it, expect } from 'vitest';
import { hospitalSyncNote } from '@/lib/hospital-sync-note';

describe('hospitalSyncNote', () => {
  it('says nothing when the emptiness is a fact about the ward', () => {
    // It synced, it is active, it was not erased — there is simply nobody
    // in the ward right now.
    expect(
      hospitalSyncNote({ isActive: true, dataPurgedAt: null, lastSyncAt: '2026-11-19T09:00:00Z' }),
    ).toBeNull();
  });

  it('says nothing when the state is unknown', () => {
    expect(hospitalSyncNote(undefined)).toBeNull();
  });

  it('names the erase when the data was purged', () => {
    const note = hospitalSyncNote({
      isActive: true,
      dataPurgedAt: '2026-11-01T00:00:00.000Z',
      lastSyncAt: '2026-10-30T09:00:00Z',
    });
    expect(note).toContain('ถูกลบข้อมูล');
    expect(note).toContain('/admin');
  });

  it('names the switch-off when the hospital is inactive', () => {
    const note = hospitalSyncNote({
      isActive: false,
      dataPurgedAt: null,
      lastSyncAt: '2026-11-19T09:00:00Z',
    });
    expect(note).toContain('ปิดการใช้งาน');
  });

  it('names the missing first sync when the hospital never synced', () => {
    const note = hospitalSyncNote({
      isActive: true,
      dataPurgedAt: null,
      lastSyncAt: null,
    });
    expect(note).toContain('ยังไม่เคยซิงก์');
    // It must say what to do, not only what went wrong.
    expect(note).toContain('ห้องคลอด');
  });

  it('prefers the erase over the missing sync', () => {
    const note = hospitalSyncNote({
      isActive: true,
      dataPurgedAt: '2026-11-01T00:00:00.000Z',
      lastSyncAt: null,
    });
    expect(note).toContain('ถูกลบข้อมูล');
  });
});
