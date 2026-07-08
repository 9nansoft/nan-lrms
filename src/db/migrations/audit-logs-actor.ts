// One-shot, idempotent migration for the audit_logs actor fix.
//
// audit_logs.user_id was created as `VARCHAR(36) NOT NULL REFERENCES users(id)`.
// BMS-session actors never get a users row, so every audit INSERT failed the
// `audit_logs_user_id_fkey` constraint and the PDPA audit trail was silently
// lost. The table definition now models user_id as a nullable, non-FK
// correlation token (see src/db/tables/audit-logs.ts), but SchemaSync only ever
// CREATEs tables or ADDs columns — it never ALTERs an existing column or
// drops a constraint. So on an already-provisioned database the old FK +
// NOT NULL persist and must be removed explicitly here.
//
// Runs on every boot (right after schema sync) and is fully idempotent:
// `DROP CONSTRAINT IF EXISTS` is a no-op when the FK is already gone, and
// `DROP NOT NULL` is a no-op when the column is already nullable.
import type { DatabaseAdapter } from '@/db/adapter';
import { logger } from '@/lib/logger';

/**
 * Drop the legacy `audit_logs_user_id_fkey` FK and the NOT NULL on
 * `audit_logs.user_id`. Postgres-only: SQLite doesn't support these ALTERs
 * and doesn't enforce FKs, and fresh SQLite/PGlite tables are already created
 * in the corrected shape, so there is nothing to migrate there.
 */
export async function migrateAuditLogsActor(
  db: DatabaseAdapter,
  driver: 'sqlite' | 'postgresql',
): Promise<void> {
  if (driver !== 'postgresql') return;

  // `ALTER TABLE IF EXISTS` guards the case where the table isn't present yet
  // (it always is post-schema-sync, but this keeps the migration order-safe).
  await db.execute(
    `ALTER TABLE IF EXISTS audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey`,
  );
  await db.execute(`ALTER TABLE IF EXISTS audit_logs ALTER COLUMN user_id DROP NOT NULL`);
  logger.info('audit_logs_actor_migrated', {});
}
