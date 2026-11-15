// Queries run against 27 hospitals' live HOSxP, on MySQL or PostgreSQL, so the
// SQL must stay portable and bounded and a failed pull must never cost data.
import { describe, it, expect, vi } from 'vitest';
import {
  ANC_LAB_ORDER_ROW_LIMIT,
  ANC_LAB_PULL_INTERVAL_MS,
  ANC_LAB_ROW_LIMIT,
  ancConfirmedLabOrdersSql,
  ancLabResultsSql,
  ancThalassemiaSql,
  ancVisitsSql,
  mapAncBundle,
  pullAncLabBundle,
  shouldPullAncLabs,
} from '@/lib/browser-poll';

type Row = Record<string, unknown>;

const master = (id: number, cid: string): Row => ({
  person_anc_id: id,
  cid,
  patient_name: 'นาง ทดสอบ',
  birthday: '1994-02-01',
  preg_no: 1,
});

const ancRow = (over: Row = {}): Row => ({
  person_anc_lab_id: 11,
  person_anc_id: 1,
  anc_service_date: '2026-03-01',
  pa_week: 12,
  anc_lab_name: 'Hct',
  lab_items_code: '101',
  lab_items_name: 'Hematocrit (HCT)',
  lab_items_unit: '%',
  anc_lab_result: '36',
  lab_result_normal: 'Y',
  ...over,
});

const orderRow = (over: Row = {}): Row => ({
  person_anc_id: 1,
  lab_order_number: 'S1',
  lab_items_code: '202',
  lab_items_name: 'Hemoglobin',
  lab_items_unit: 'g/dL',
  order_date: '2026-03-01',
  report_date: '2026-03-02',
  lab_order_result: '11.2',
  abnormal_result: 'N',
  lab_items_normal_value_ref: '12-16',
  ...over,
});

/** Routes each statement to the rows or failure a test wants. */
function fakeRun(handlers: { anc?: Row[]; order?: Row[] | Error; thal?: Row[] | Error }) {
  return vi.fn(async (sql: string): Promise<Row[]> => {
    if (sql.includes('person_anc_lab')) return handlers.anc ?? [];
    if (sql.includes('lab_head')) {
      const order = handlers.order ?? [];
      if (order instanceof Error) throw order;
      return order;
    }
    if (sql.includes('thalasseima')) {
      const thal = handlers.thal ?? [];
      if (thal instanceof Error) throw thal;
      return thal;
    }
    throw new Error(`unexpected sql: ${sql}`);
  });
}

describe('ancVisitsSql', () => {
  it('no longer reads hematocrit from a fixed anc_lab_id', () => {
    expect(ancVisitsSql()).not.toMatch(/anc_lab_id\s*=/);
    expect(ancVisitsSql()).not.toMatch(/hct_result/);
  });
});

describe('ancLabResultsSql', () => {
  const sql = ancLabResultsSql();

  it('resolves names through the catalogue and never hardcodes an id', () => {
    expect(sql).toMatch(/person_anc_lab/);
    expect(sql).toMatch(/JOIN anc_lab/);
    expect(sql).toMatch(/LEFT JOIN lab_items/);
    expect(sql).not.toMatch(/anc_lab_id\s*=\s*\d/);
  });

  it('is limited to active pregnancies and bounded', () => {
    expect(sql).toMatch(/pa\.labor_status_id = 1/);
    expect(sql).toContain(`LIMIT ${ANC_LAB_ROW_LIMIT}`);
  });
});

describe('ancConfirmedLabOrdersSql', () => {
  it('reads only confirmed results that were not cancelled', () => {
    const sql = ancConfirmedLabOrdersSql('current');
    expect(sql).toMatch(/h\.confirm_report = 'Y'/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM lab_head_abort/);
  });

  it('uses the item-level confirm flag on older builds, still excluding cancelled orders', () => {
    const sql = ancConfirmedLabOrdersSql('legacy');
    expect(sql).toMatch(/lo\.confirm = 'Y'/);
    expect(sql).not.toMatch(/confirm_report/);
    expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM lab_head_abort/);
  });

  it('is windowed by LMP, pre-filtered and bounded', () => {
    const sql = ancConfirmedLabOrdersSql('current');
    expect(sql).toMatch(/h\.order_date >= COALESCE\(pa\.lmp/);
    expect(sql).toMatch(/LOWER\(li\.lab_items_name\) LIKE 'hemoglobin%'/);
    expect(sql).toContain(`LIMIT ${ANC_LAB_ORDER_ROW_LIMIT}`);
  });
});

describe('ancThalassemiaSql', () => {
  it('reads only the verified columns, for active pregnancies, bounded', () => {
    const sql = ancThalassemiaSql();
    expect(sql).toMatch(/thalasseima_wife_dcip_result/);
    expect(sql).toMatch(/pa\.labor_status_id = 1/);
    expect(sql).toMatch(/LIMIT \d+/);
  });
});

describe('shouldPullAncLabs', () => {
  it('pulls on the first cycle, then only after the interval', () => {
    const now = 1_000_000_000;
    expect(shouldPullAncLabs(now, null)).toBe(true);
    expect(shouldPullAncLabs(now, now - 1000)).toBe(false);
    expect(shouldPullAncLabs(now, now - ANC_LAB_PULL_INTERVAL_MS)).toBe(true);
  });
});

describe('pullAncLabBundle', () => {
  it('groups rows by pregnancy with stable source ids', async () => {
    const bundle = await pullAncLabBundle(fakeRun({ anc: [ancRow()], order: [orderRow()] }));
    const rows = bundle.byAncId.get('1') ?? [];
    expect(rows.map((r) => r.sourceId).sort()).toEqual(['11', 'S1:202']);
    const anc = rows.find((r) => r.source === 'anc_lab');
    expect(anc).toMatchObject({
      resultDate: '2026-03-01',
      gaWeeks: 12,
      ancLabName: 'Hct',
      labItemsName: 'Hematocrit (HCT)',
      labItemsCode: '101',
      result: '36',
      unit: '%',
      ancResultNormalRaw: 'Y',
    });
    const order = rows.find((r) => r.source === 'lab_order');
    // The blood draw, not the report: this date links the result to its visit.
    expect(order).toMatchObject({
      resultDate: '2026-03-01',
      result: '11.2',
      abnormalFlag: 'N',
      normalReference: '12-16',
    });
  });

  it('drops lab orders the app has no use for', async () => {
    const bundle = await pullAncLabBundle(
      fakeRun({ order: [orderRow({ lab_items_name: 'Hb A1C' })] }),
    );
    expect(bundle.byAncId.size).toBe(0);
  });

  it('sends one row for a lab order joined to two pregnancies, newest first', async () => {
    const bundle = await pullAncLabBundle(
      fakeRun({ order: [orderRow({ person_anc_id: 2 }), orderRow({ person_anc_id: 1 })] }),
    );
    expect(bundle.byAncId.get('2')).toHaveLength(1);
    expect(bundle.byAncId.has('1')).toBe(false);
  });

  it('reports truncation when a query hits its row limit', async () => {
    const anc = Array.from({ length: ANC_LAB_ROW_LIMIT }, (_, i) =>
      ancRow({ person_anc_lab_id: i }),
    );
    const bundle = await pullAncLabBundle(fakeRun({ anc }));
    expect(bundle.truncated).toBe(true);
  });

  it('does not report truncation below the limit', async () => {
    const bundle = await pullAncLabBundle(fakeRun({ anc: [ancRow()] }));
    expect(bundle.truncated).toBe(false);
  });

  it('falls back to the older confirm flag when the current query fails', async () => {
    const run = vi.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('confirm_report')) throw new Error('Unknown column');
      if (sql.includes('lab_head')) return [orderRow()];
      return [];
    });
    const bundle = await pullAncLabBundle(run);
    expect(bundle.orderQuery).toBe('legacy');
    expect(bundle.byAncId.get('1')).toHaveLength(1);
  });

  it('skips lab orders rather than reading them unfiltered when both queries fail', async () => {
    const bundle = await pullAncLabBundle(
      fakeRun({ anc: [ancRow()], order: new Error('no lab_head_abort') }),
    );
    expect(bundle.orderQuery).toBe('failed');
    expect(bundle.byAncId.get('1')?.map((r) => r.source)).toEqual(['anc_lab']);
  });

  it('distinguishes a failed ANC lab query from having no rows', async () => {
    const failing = vi.fn(async (sql: string): Promise<Row[]> => {
      if (sql.includes('person_anc_lab')) throw new Error('gateway');
      return [];
    });
    expect((await pullAncLabBundle(failing)).ancQueryFailed).toBe(true);
    expect((await pullAncLabBundle(fakeRun({}))).ancQueryFailed).toBe(false);
  });

  it('keeps the rest of the bundle when thalassemia columns are missing', async () => {
    const bundle = await pullAncLabBundle(
      fakeRun({ anc: [ancRow()], thal: new Error('Unknown column') }),
    );
    expect(bundle.byAncId.get('1')).toHaveLength(1);
  });

  it('carries thalassemia flags raw and unclassifiable because their meaning is unconfirmed', async () => {
    const bundle = await pullAncLabBundle(
      fakeRun({ thal: [{ person_anc_id: 1, thalasseima_wife_dcip_result: 'N' }] }),
    );
    const rows = bundle.byAncId.get('1') ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: 'person_anc', result: 'N', labItemsName: null });
    expect(rows[0].sourceId).toBe('1:thalasseima_wife_dcip_result');
    expect(rows[0].ancLabName).toMatch(/^Thalassemia/);
  });
});

describe('mapAncBundle — lab attachment', () => {
  const cid = '1100500090006';

  it('attaches each pregnancy its own lab rows', () => {
    const rows = [{ source: 'anc_lab' as const, sourceId: '11', result: '36' }];
    const [patient] = mapAncBundle([master(1, cid)], [], [], new Map([['1', rows]]));
    expect(patient.labResults).toEqual(rows);
  });

  it('omits the field when no lab pull ran, so the server changes nothing', () => {
    const [patient] = mapAncBundle([master(1, cid)], [], []);
    expect(patient).not.toHaveProperty('labResults');
  });

  it('no longer sends a hematocrit from the visit row', () => {
    const [patient] = mapAncBundle(
      [master(1, cid)],
      [
        {
          person_anc_id: 1,
          anc_service_date: '2026-03-01',
          anc_service_number: 1,
          hct_result: '36',
        },
      ],
      [],
    );
    expect(patient.visits?.[0]).not.toHaveProperty('hctPct');
  });
});
