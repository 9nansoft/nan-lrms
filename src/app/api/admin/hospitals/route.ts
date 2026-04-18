// T093: GET /api/admin/hospitals — admin hospital list with BMS config
import { NextResponse } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    await ensureInit();
    const db = await getDatabase();

    const hospitals = await db.query<{
      hcode: string;
      name: string;
      level: string;
      is_active: boolean;
      connection_status: string;
      last_sync_at: string | null;
      tunnel_url: string | null;
      session_jwt: string | null;
      session_expires_at: string | null;
      database_type: string | null;
    }>(
      `SELECT h.hcode, h.name, h.level, h.is_active, h.connection_status, h.last_sync_at,
              hbc.tunnel_url, hbc.session_jwt, hbc.session_expires_at, hbc.database_type
       FROM hospitals h
       LEFT JOIN hospital_bms_config hbc ON hbc.hospital_id = h.id
       ORDER BY h.name`,
    );

    return NextResponse.json({
      hospitals: hospitals.map((h) => ({
        hcode: h.hcode,
        name: h.name,
        level: h.level,
        isActive: h.is_active,
        connectionStatus: h.connection_status,
        lastSyncAt: h.last_sync_at,
        bmsConfig: h.tunnel_url ? {
          tunnelUrl: h.tunnel_url,
          hasSession: !!h.session_jwt,
          sessionExpiresAt: h.session_expires_at,
          databaseType: h.database_type,
        } : null,
      })),
    });
  } catch (error) {
    logger.error('admin_hospitals_api_failed', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
