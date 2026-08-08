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

// `labor_status` answers "is she still on the ward?", NOT "has she given
// birth?". Those are different questions and DELIVERED already owns the first
// one: markPatientsDelivered (sync/patient.ts) sets it for admissions HOSxP has
// stopped returning. Overloading it with "gave birth, still admitted" would
// collapse two states AND drop postpartum women off the ALL ACTIVE board, which
// is the board of women who are not discharged. The birth goes in its own
// field, `delivered_at`, and the UI renders รอคลอด vs คลอดแล้ว from it.
describe('mapLabor — labor_status tracks the admission, not the birth', () => {
  it('is ACTIVE while she is still in labour (no birth, no discharge)', () => {
    expect(mapLabor(laborRow())?.labor_status).toBe('ACTIVE');
  });

  it('stays ACTIVE after the birth while she is still admitted', () => {
    // The น้ำพอง case: baby born, mother still on the ward postpartum. She
    // belongs on the board — with a status column, not removed from it.
    const mapped = mapLabor(laborRow({ labour_finishdate: '2026-08-05', dchdate: null }));
    expect(mapped?.labor_status).toBe('ACTIVE');
  });

  it('is DELIVERED on discharge', () => {
    // Pre-existing behaviour must not regress: hospitals that DO complete the
    // discharge screen keep working exactly as before.
    const mapped = mapLabor(laborRow({ dchdate: '2026-08-07', labour_finishdate: null }));
    expect(mapped?.labor_status).toBe('DELIVERED');
  });
});

describe('mapLabor — delivered_at carries the birth', () => {
  it('is null while she is still in labour', () => {
    expect(mapLabor(laborRow())?.delivered_at).toBeNull();
  });

  it('is the recorded birth date once labour has finished', () => {
    expect(mapLabor(laborRow({ labour_finishdate: '2026-08-05' }))?.delivered_at).toBe(
      '2026-08-05',
    );
  });

  it('treats HOSxP unset dates as "not delivered"', () => {
    // HOSxP/MySQL hands back '' and '0000-00-00' for unset dates far more often
    // than NULL. Either one read as a birth would show every woman on the ward
    // as delivered the moment her labour record is opened.
    expect(mapLabor(laborRow({ labour_finishdate: '' }))?.delivered_at).toBeNull();
    expect(mapLabor(laborRow({ labour_finishdate: '0000-00-00' }))?.delivered_at).toBeNull();
  });

  it('normalises a Buddhist-era year, as every other HOSxP event date is', () => {
    // Some sites store พ.ศ. in DATE columns (see lib/hosxp-date.ts). An
    // un-normalised 2569 would render as a birth 543 years in the future.
    expect(mapLabor(laborRow({ labour_finishdate: '2569-08-05' }))?.delivered_at).toBe(
      '2026-08-05',
    );
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
