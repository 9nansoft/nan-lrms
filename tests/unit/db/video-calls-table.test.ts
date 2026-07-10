import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';

// video_calls backs the hospital-to-hospital video call feature: one row per
// call attempt with actor identity snapshotted inline (audit_logs pattern) so
// the history survives user deletion. Room ids are unguessable UUIDs — the
// only access control on the anonymous-join Jitsi server.
describe('video_calls table', () => {
  let db: DatabaseAdapter;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it('is created by schema sync', async () => {
    const tables = await db.getTableNames();
    expect(tables).toContain('video_calls');
  });

  it('has caller/callee snapshot columns, room id, status and lifecycle timestamps', async () => {
    const columns = await db.getColumnInfo('video_calls');
    const byName = new Map(columns.map((c) => [c.name, c]));

    for (const required of [
      'id',
      'room_id',
      'caller_user_id',
      'caller_name',
      'caller_hospital_code',
      'callee_user_id',
      'callee_name',
      'callee_hospital_code',
      'status',
      'created_at',
      'answered_at',
      'ended_at',
    ]) {
      expect(byName.has(required), `missing column ${required}`).toBe(true);
    }

    // Lifecycle timestamps are null until the call is answered/finished.
    expect(byName.get('answered_at')?.nullable).toBe(true);
    expect(byName.get('ended_at')?.nullable).toBe(true);
    // Identity snapshots are mandatory at insert time.
    expect(byName.get('caller_user_id')?.nullable).toBe(false);
    expect(byName.get('callee_user_id')?.nullable).toBe(false);
    expect(byName.get('status')?.nullable).toBe(false);
  });

  it('stores and returns a full call row round-trip', async () => {
    await db.execute(
      `INSERT INTO video_calls
         (id, room_id, caller_user_id, caller_name, caller_hospital_code,
          callee_user_id, callee_name, callee_hospital_code, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        '3e0e40f1-1111-4222-8333-444455556666',
        'kklrms-9f8e7d6c-aaaa-4bbb-8ccc-ddddeeee0000',
        'user-caller-1',
        'พญ.ทดสอบ ระบบ',
        '10670',
        'user-callee-1',
        'นพ.ปลายทาง สาย',
        '11004',
        'ringing',
      ],
    );
    const rows = await db.query<{ status: string; ended_at: Date | null }>(
      'SELECT status, ended_at FROM video_calls WHERE caller_user_id = ?',
      ['user-caller-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('ringing');
    expect(rows[0].ended_at).toBeNull();
  });
});
