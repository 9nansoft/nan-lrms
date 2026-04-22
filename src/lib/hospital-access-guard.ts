// Gate that decides whether a BMS-session identity is allowed to hold a
// KK-LRMS session at all. Called from the NextAuth authorize callback after
// validateBmsSession() has returned an identity — if the gate denies, the
// login is rejected (authorize returns null) and the user never gets a JWT.
//
// Policy:
//   1. ADMIN role → always allowed (system administrators have cross-province
//      access and may operate against not-yet-registered hospitals during
//      onboarding).
//   2. Exempt facility codes → always allowed:
//        '00000' reserved system-level account
//        '99999' reserved provincial/admin testing account
//   3. Otherwise → hcode must match an active row in the operational
//      `hospitals` table. A hospital removed or deactivated by an admin
//      (via /admin · โรงพยาบาล) cannot issue new sessions.
//
// The check runs once per login, not per request. Existing sessions whose
// hospital is removed remain valid until JWT expiry (session.maxAge, 8 h).
import type { DatabaseAdapter } from '@/db/adapter';
import { UserRole } from '@/types/domain';
import { logger } from '@/lib/logger';

// `getDatabase` / `ensureInit` pull the full sync service graph (which uses
// Node `crypto`) and cannot be statically imported here: this module is
// reachable from `auth.ts` → `middleware.ts`, which runs on the Edge runtime.
// Deferring the import keeps middleware Edge-safe while still letting the
// authorize callback (Node runtime) resolve the live DB.
async function resolveDefaultDb(): Promise<DatabaseAdapter> {
  const { ensureInit } = await import('@/lib/ensure-init');
  const { getDatabase } = await import('@/db/connection');
  await ensureInit();
  return getDatabase();
}

export const EXEMPT_HCODES: ReadonlySet<string> = new Set(['00000', '99999']);

export interface HospitalAccessInput {
  hospitalCode: string;
  role: UserRole | string;
}

/**
 * Returns true iff the identity is allowed to hold a KK-LRMS session.
 * The optional `db` parameter lets tests inject a pre-built adapter without
 * bootstrapping the global `ensureInit()` singleton — production callers
 * omit it and let the gate resolve the live database.
 */
export async function isHospitalAccessAllowed(
  input: HospitalAccessInput,
  db?: DatabaseAdapter,
): Promise<boolean> {
  if (input.role === UserRole.ADMIN) return true;
  if (EXEMPT_HCODES.has(input.hospitalCode)) return true;

  const adapter = db ?? (await resolveDefaultDb());

  const rows = await adapter.query<{ id: string }>(
    'SELECT id FROM hospitals WHERE hcode = ? AND is_active = true',
    [input.hospitalCode],
  );
  return rows.length > 0;
}

/** Convenience wrapper that logs the rejection reason for observability. */
export async function assertHospitalAccess(
  input: HospitalAccessInput,
  db?: DatabaseAdapter,
): Promise<boolean> {
  const allowed = await isHospitalAccessAllowed(input, db);
  if (!allowed) {
    logger.warn('hospital_access_denied', {
      hospitalCode: input.hospitalCode,
      role: input.role,
      reason: 'hcode_not_in_registered_hospitals',
    });
  }
  return allowed;
}
