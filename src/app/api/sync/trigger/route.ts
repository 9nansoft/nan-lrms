// POST /api/sync/trigger — on-demand data sync for the user's hospital
import { v4 as uuidv4 } from 'uuid';
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { auth } from '@/lib/auth';
import { requestImmediateSync } from '@/services/sync';
import { SseManager } from '@/lib/sse';
import { logger } from '@/lib/logger';

export async function POST() {
  try {
    await ensureInit();

    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDatabase();
    const sseManager = SseManager.getInstance();

    // Get hospital info from the user's session (set during BMS login)
    const hospitalCode = session.user.hospitalCode;
    if (!hospitalCode) {
      return NextResponse.json({ synced: false, reason: 'no_hospital_code', lastSyncAt: null });
    }

    // Resolve hcode → hospital UUID (auto-register if not found)
    let hospitals = await db.query<{ id: string }>(
      'SELECT id FROM hospitals WHERE hcode = ?',
      [hospitalCode],
    );

    if (hospitals.length === 0) {
      // Auto-register hospital from user's BMS profile
      const hospitalId = uuidv4();
      const now = new Date().toISOString();
      const hospitalName = session.user.hospitalName || `รพ.${hospitalCode}`;

      await db.execute(
        `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        // Postgres strict boolean — use true, not 1 (SQLite is loose).
        [hospitalId, hospitalCode, hospitalName, 'M2', true, 'UNKNOWN', now, now],
      );

      // Also store BMS tunnel config if available
      if (session.user.tunnelUrl) {
        await db.execute(
          `INSERT INTO hospital_bms_config (id, hospital_id, tunnel_url, database_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), hospitalId, session.user.tunnelUrl, session.user.databaseType || 'postgresql', now, now],
        );
      }

      logger.info('hospital_auto_registered', {
        hospitalName,
        hospitalCode,
        tunnelUrl: session.user.tunnelUrl || 'none',
      });
      hospitals = [{ id: hospitalId }];
    }

    const result = await requestImmediateSync(db, hospitals[0].id, sseManager);
    return NextResponse.json({ ...result, hcode: hospitalCode });
  } catch (error) {
    logger.error('sync_trigger_failed', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
