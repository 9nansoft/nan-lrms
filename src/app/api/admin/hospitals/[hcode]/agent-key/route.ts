// POST /api/admin/hospitals/[hcode]/agent-key — mint an API key for the
// headless agent that runs on the hospital's own workstation.
//
// The raw key is returned ONCE (only its sha256 hash is stored, exactly like
// every other webhook key) — the admin copies it into the hospital's
// agent.config.json. GET lists the keys that exist for the hospital so an
// admin can see what is installed and revoke what is not.
//
// Admin-gated by middleware + requireAdmin.
import { NextResponse, type NextRequest } from 'next/server';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { requireAdmin } from '@/lib/admin-guard';
import { logger } from '@/lib/logger';
import { createApiKey } from '@/services/webhook';

const AGENT_KEY_LABEL = 'NN-LRMS agent';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ hcode: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    await ensureInit();
    const { hcode } = await params;
    const db = await getDatabase();
    const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
      hcode,
    ]);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'ไม่พบโรงพยาบาล' } },
        { status: 404 },
      );
    }

    const created = await createApiKey(db, rows[0].id, AGENT_KEY_LABEL);
    logger.info('agent_key_minted', { hcode, keyPrefix: created.keyPrefix });

    return NextResponse.json({
      hcode,
      key: created.rawKey,
      keyPrefix: created.keyPrefix,
      label: AGENT_KEY_LABEL,
      // The agent config the hospital needs — everything except the key.
      agentConfig: {
        serverUrl: process.env.NEXT_PUBLIC_NN_LRMS_PUBLIC_URL ?? 'https://kk-lrms.bmscloud.in.th',
        apiKey: created.rawKey,
        intervalMinutes: 5,
        localGateway: 'http://127.0.0.1:45011',
        marketplaceToken: null,
      },
    });
  } catch (error) {
    logger.error('agent_key_mint_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'ออกคีย์ agent ไม่สำเร็จ' } },
      { status: 500 },
    );
  }
}

// GET — the agent keys installed for this hospital (never the raw key).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ hcode: string }> },
) {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    await ensureInit();
    const { hcode } = await params;
    const db = await getDatabase();
    const rows = await db.query<{ id: string }>('SELECT id FROM hospitals WHERE hcode = ?', [
      hcode,
    ]);
    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'ไม่พบโรงพยาบาล' } },
        { status: 404 },
      );
    }

    const keys = await db.query<{
      id: string;
      key_prefix: string;
      label: string;
      is_active: boolean | number;
      revoked_at: string | null;
      last_used_at: string | null;
      created_at: string;
    }>(
      `SELECT id, key_prefix, label, is_active, revoked_at, last_used_at, created_at
         FROM webhook_api_keys
        WHERE hospital_id = ? AND label = ?
        ORDER BY created_at DESC`,
      [rows[0].id, AGENT_KEY_LABEL],
    );

    return NextResponse.json({
      hcode,
      keys: keys.map((k) => ({
        id: k.id,
        keyPrefix: k.key_prefix,
        label: k.label,
        active: k.is_active === true || k.is_active === 1,
        revokedAt: k.revoked_at,
        lastUsedAt: k.last_used_at,
        createdAt: k.created_at,
      })),
    });
  } catch (error) {
    logger.error('agent_key_list_failed', { error });
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'อ่านรายการคีย์ agent ไม่สำเร็จ' } },
      { status: 500 },
    );
  }
}
