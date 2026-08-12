// TDD (Red→Green) for the shared alert-origin helper.
//
// Four producers now need the same three values before they can enqueue a MOPH
// alert: the origin hospital's display name, its province code (center-monitor
// resolution) and the Asia/Bangkok calendar date (part of the dedup key). This
// pins the behaviour the two pre-existing inline blocks had, so the refactor
// that replaces them is provably equivalent.
import { describe, it, expect, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { resolveAlertOrigin } from '@/services/alert-context';

/** Asia/Bangkok 'YYYY-MM-DD', derived independently of the helper's
 *  toLocaleDateString('en-CA') route so the assertion is not a restatement. */
function bangkokCalendarDate(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

describe('resolveAlertOrigin', () => {
  let db: DatabaseAdapter;
  let hospitalId: string;

  beforeEach(async () => {
    db = await createTestDb();
    hospitalId = randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, province_code, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [hospitalId, '10682', 'รพ.ขอนแก่น', 'P_PLUS', '30', true, now, now],
    );
  });

  it('returns the hospital name and province code for a seeded hospital', async () => {
    const origin = await resolveAlertOrigin(db, hospitalId, '10682');
    expect(origin.hospitalName).toBe('รพ.ขอนแก่น');
    expect(origin.province).toBe('30');
  });

  it('falls back to the supplied name and an empty province when the hospital row is missing', async () => {
    const origin = await resolveAlertOrigin(db, randomUUID(), '99999');
    expect(origin.hospitalName).toBe('99999');
    expect(origin.province).toBe('');
  });

  it("returns province '' (not null) when province_code is NULL", async () => {
    // Empty-string province is load-bearing: resolveRecipients tests it with
    // `province.trim()` and logs moph_alert_empty_province. A null here would
    // land in the AlertEventContext as a type lie.
    const bare = randomUUID();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [bare, '10683', 'รพ.ไม่มีจังหวัด', 'M2', true, now, now],
    );
    const origin = await resolveAlertOrigin(db, bare, '10683');
    expect(origin.province).toBe('');
  });

  it('computes localDate as the Asia/Bangkok calendar date', async () => {
    const origin = await resolveAlertOrigin(db, hospitalId, '10682');
    expect(origin.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(origin.localDate).toBe(bangkokCalendarDate());
  });
});
