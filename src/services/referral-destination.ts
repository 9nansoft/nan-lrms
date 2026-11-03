import { randomUUID } from 'crypto';
import type { DatabaseAdapter } from '@/db/adapter';
import { HospitalLevel } from '@/types/domain';

/** A referral destination need not be enrolled in this deployment. Keep a
 * registry-backed, inactive reference for the referral FK without granting
 * login, sync, or monitored-network membership. Only admins activate sites. */
export async function resolveReferralDestination(
  db: DatabaseAdapter,
  hcode: string,
): Promise<{ id: string; hcode: string } | null> {
  const existing = await db.query<{ id: string; hcode: string }>(
    'SELECT id, hcode FROM hospitals WHERE hcode = ?', [hcode],
  );
  if (existing[0]) return existing[0];

  const now = new Date().toISOString();
  // One conditional insert also handles concurrent first referrals. Do not
  // guess clinical capability from facility type or enable an existing site.
  await db.execute(
    `INSERT INTO hospitals
       (id, hcode, name, level, province_code, district_code,
        is_active, connection_status, created_at, updated_at)
     SELECT ?, hcode, name, ?, province_code, district_code, false, 'UNKNOWN', ?, ?
       FROM moph_hospitals WHERE hcode = ?
     ON CONFLICT (hcode) DO NOTHING`,
    [randomUUID(), HospitalLevel.UNKNOWN, now, now, hcode],
  );
  const resolved = await db.query<{ id: string; hcode: string }>(
    'SELECT id, hcode FROM hospitals WHERE hcode = ?', [hcode],
  );
  return resolved[0] ?? null;
}
