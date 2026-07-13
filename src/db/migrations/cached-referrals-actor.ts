// One-shot, idempotent migration for the cached_referrals actor fix.
//
// cached_referrals.initiated_by / accepted_by were created as
// `VARCHAR(36) REFERENCES users(id)`. BMS-session actors never get a users
// row, so every referral create/accept INSERT failed the
// cached_referrals_initiated_by_fkey / cached_referrals_accepted_by_fkey
// constraint. The table definition now models these columns as nullable,
// non-FK correlation tokens (see src/db/tables/cached-referrals.ts), but
// SchemaSync only ever CREATEs tables or ADDs columns — it never ALTERs an
// existing column or drops a constraint. So on an already-provisioned
// database the old FKs persist and must be removed explicitly here.
//
// Runs on every boot (right after schema sync) and is fully idempotent:
// `DROP CONSTRAINT IF EXISTS` is a no-op when the FK is already gone.
//
// Same rationale as src/db/migrations/audit-logs-actor.ts (bc31704).
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';

/**
 * Drop the legacy `cached_referrals_initiated_by_fkey` and
 * `cached_referrals_accepted_by_fkey` FKs to users(id). Fresh databases
 * (including pglite) already create the table in the corrected shape, so on
 * them both ALTERs are no-ops.
 */
export async function migrateCachedReferralsActor(db: DatabaseAdapter): Promise<void> {
  // `ALTER TABLE IF EXISTS` guards the case where the table isn't present yet
  // (it always is post-schema-sync, but this keeps the migration order-safe).
  await db.execute(
    `ALTER TABLE IF EXISTS cached_referrals DROP CONSTRAINT IF EXISTS cached_referrals_initiated_by_fkey`,
  );
  await db.execute(
    `ALTER TABLE IF EXISTS cached_referrals DROP CONSTRAINT IF EXISTS cached_referrals_accepted_by_fkey`,
  );
  logger.info('cached_referrals_actor_migrated', {});
}
