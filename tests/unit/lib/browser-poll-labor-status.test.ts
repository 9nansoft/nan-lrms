// Unit tests for how the browser gateway decides ACTIVE vs DELIVERED.
//
// Context (รพ.น้ำพอง, 2026-08-08): ward staff completed the labor-room screen
// for four women, yet all four stayed on the "ALL ACTIVE" board. Root cause:
// status was derived ONLY from `ipt.dchdate` — i.e. from DISCHARGE, not from
// DELIVERY. A mother who has given birth but is still admitted postpartum was
// indistinguishable from one still in labour, and only left the board when the
// 7-day stale-admission timer dropped her (STALE_ADMISSION.autoCloseAfterDays).
//
// HOSxP records the birth in the `labor` table — `labour_finishdate`
// (วันที่เด็กเกิด) / `labour_finishtime` (เด็กเกิดเวลา). NOT in `ipt_labour`,
// which is the labour-room ADMISSION register and carries no delivery
// timestamp at all (BMS Mantis #4105 is that exact confusion:
// `column "labour_finishtime" does not exist` when queried against ipt_labour).
// Keying off "an ipt_labour row exists" would mark every arriving woman as
// delivered and empty the labour board — hence the explicit test below that
// an ipt_labour-only row stays ACTIVE.
import { describe, it, expect } from 'vitest';
import { countLaborWithBirthDate, mapLabor, SQL_ACTIVE_LABOUR } from '@/lib/browser-poll';

/** A row shaped like the gateway's active-labour SELECT. */
function laborRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    hn: '690001337',
    an: '690008757',
    patient_name: 'นางสมมุติ ทดสอบ',
    cid: '1234567890123',
    regdate: '2026-08-05',
    regtime: '08:28:00',
    birthday: '1995-01-01',
    dchdate: null,
    labour_finishdate: null,
    ...overrides,
  };
}

describe('mapLabor — ACTIVE vs DELIVERED', () => {
  it('is ACTIVE while she is still in labour (no birth, no discharge)', () => {
    expect(mapLabor(laborRow())?.labor_status).toBe('ACTIVE');
  });

  it('is DELIVERED once labor.labour_finishdate is recorded, even without discharge', () => {
    // The น้ำพอง case: baby born, mother still admitted postpartum.
    const mapped = mapLabor(laborRow({ labour_finishdate: '2026-08-05', dchdate: null }));
    expect(mapped?.labor_status).toBe('DELIVERED');
  });

  it('stays DELIVERED on discharge, with no birth date recorded', () => {
    // Pre-existing behaviour must not regress: hospitals that DO complete the
    // discharge screen keep working exactly as before.
    const mapped = mapLabor(laborRow({ dchdate: '2026-08-07', labour_finishdate: null }));
    expect(mapped?.labor_status).toBe('DELIVERED');
  });

  it('treats an empty-string labour_finishdate as "not delivered"', () => {
    // HOSxP/MySQL hands back '' and '0000-00-00' for unset dates far more often
    // than NULL. Either one must NOT be read as a birth, or every woman on the
    // ward would be marked delivered the moment her labour record is opened.
    expect(mapLabor(laborRow({ labour_finishdate: '' }))?.labor_status).toBe('ACTIVE');
    expect(mapLabor(laborRow({ labour_finishdate: '0000-00-00' }))?.labor_status).toBe('ACTIVE');
  });
});

describe('countLaborWithBirthDate — the diagnostic that makes a reload conclusive', () => {
  // Whether the fix worked at a given hospital is otherwise a coin flip: the
  // rows either clear or they don't, and if they don't we cannot tell "no birth
  // recorded in HOSxP" from "recorded somewhere we still don't read". Counting
  // how many active-labour rows came back carrying a birth date turns the next
  // push into evidence. Counted off the RAW rows, before mapping, because
  // mapLabor keeps only the derived status.
  it('counts only rows with a real birth date', () => {
    expect(
      countLaborWithBirthDate([
        { labour_finishdate: '2026-08-05' },
        { labour_finishdate: null },
        { labour_finishdate: '' },
        { labour_finishdate: '0000-00-00' },
        { labour_finishdate: '2026-08-06' },
      ]),
    ).toBe(2);
  });

  it('is 0 for an empty ward and never throws on a row missing the column', () => {
    // An older gateway bundle has no labour_finishdate in its SELECT at all.
    expect(countLaborWithBirthDate([])).toBe(0);
    expect(countLaborWithBirthDate([{ an: '1' }, { an: '2' }])).toBe(0);
  });
});

describe('SQL_ACTIVE_LABOUR — the delivery signal must actually be fetched', () => {
  it('joins the labor table and selects labour_finishdate', () => {
    // mapLabor cannot see a column the query never selected. Before this fix
    // the mapper had no delivery signal available at all.
    expect(SQL_ACTIVE_LABOUR).toMatch(/\blabor\b/);
    expect(SQL_ACTIVE_LABOUR).toMatch(/labour_finishdate/);
  });

  it('does not read a delivery timestamp off ipt_labour (Mantis #4105)', () => {
    // ipt_labour has no such column; querying it there is an error, not a miss.
    expect(SQL_ACTIVE_LABOUR).not.toMatch(/ipt_labour\s+\w*\s*ON[^\n]*labour_finish/i);
  });
});
