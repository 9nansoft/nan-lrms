// POST /api/onboarding/webhook-key
//
// Onboarding companion for the HOSxP webhook_setting auto-provisioner.
// When a user lands on `/` with a marketplace_token the client calls this
// route to mint a KK-LRMS webhook API key for their registered hospital,
// then pushes the key into HOSxP's `webhook_setting` table (module_id=3,
// setting_code='KK-LRMS') via BMS REST. This route does NOT touch HOSxP —
// it only provisions the KK-LRMS side.
//
// The hospital must already exist in the admin `hospitals` table. That's
// enforced upstream by the session guard (hospital-access-guard), but we
// also double-check here so a stale session can't silently fabricate keys.
import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/db/connection';
import { ensureInit } from '@/lib/ensure-init';
import { createApiKey } from '@/services/webhook';
import { logger } from '@/lib/logger';

interface Body {
  /** Optional override label — defaults to "HOSxP auto-provisioned". */
  label?: string;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.hospitalCode) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const hcode = session.user.hospitalCode;

  try {
    await ensureInit();
    const body = (await request.json().catch(() => ({}))) as Body;
    const db = await getDatabase();

    const rows = await db.query<{ id: string; name: string }>(
      'SELECT id, name FROM hospitals WHERE hcode = ?',
      [hcode],
    );
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `hospital ${hcode} not registered — ask admin to add it first` },
        { status: 404 },
      );
    }
    const hospital = rows[0];

    const label = body.label?.trim() || 'HOSxP auto-provisioned';
    const { id, rawKey, keyPrefix } = await createApiKey(db, hospital.id, label);

    logger.info('onboarding_webhook_key_created', {
      hcode,
      keyPrefix,
      label,
    });

    return NextResponse.json({
      id,
      apiKey: rawKey,
      keyPrefix,
      label,
      hcode,
      hospitalName: hospital.name,
    });
  } catch (error) {
    logger.error('onboarding_webhook_key_failed', { hcode, error });
    return NextResponse.json({ error: 'failed to create webhook key' }, { status: 500 });
  }
}
