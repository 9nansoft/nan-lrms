// Shared alert-origin resolution for MOPH Prompt producers.
//
// Every producer needs the same three values before it can build an
// AlertEventContext: the origin hospital's display name, its province code
// (province_center recipient resolution) and the Asia/Bangkok calendar date
// (part of the moph_alert_log dedup key). This was inlined identically at the
// ANC HR3 site and the maternal-triage site; Phase 2 adds two more producers,
// so it lives here once (Constitution III/IV).
import type { DatabaseAdapter } from '@/db/adapter';

export interface AlertOrigin {
  hospitalName: string;
  province: string;
  /** 'YYYY-MM-DD' in Asia/Bangkok — part of the moph_alert_log dedup key. */
  localDate: string;
}

/**
 * Resolve the origin hospital's alert context.
 *
 * `fallbackName` is used when the hospitals row is missing — both original call
 * sites passed the hcode, which is the least-wrong thing to render in the LINE
 * message. A missing/NULL province_code becomes '' (never null): the recipient
 * resolver tests it with `province.trim()` and warns on empty, so '' keeps that
 * path intact instead of introducing a nullable into AlertEventContext.
 */
export async function resolveAlertOrigin(
  db: DatabaseAdapter,
  hospitalId: string,
  fallbackName: string,
): Promise<AlertOrigin> {
  const rows = await db.query<{ name: string; province_code: string | null }>(
    'SELECT name, province_code FROM hospitals WHERE id = ?',
    [hospitalId],
  );
  return {
    hospitalName: rows[0]?.name ?? fallbackName,
    province: rows[0]?.province_code ?? '',
    localDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
  };
}

