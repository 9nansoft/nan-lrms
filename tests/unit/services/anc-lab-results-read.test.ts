// The one door the UI uses, so it is where encrypted and withheld values must
// come back correctly, and where a broken ciphertext must not reach a screen.
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { createTestDb } from '../../helpers/testDb';
import type { DatabaseAdapter } from '@/db/adapter';
import { generateKey } from '@/lib/encryption';
import { logger } from '@/lib/logger';
import { processAncWebhook, type WebhookAncPayload } from '@/services/webhook';
import { listJourneyLabResults } from '@/services/anc-lab-results';
import type { AncLabPayloadRow } from '@/services/anc-lab-classifier';
import type { SseManager } from '@/lib/sse';

const HOSPITAL_ID = '00000000-0000-4000-8000-0000000000b1';
const sse = { broadcast(): void {} } as unknown as SseManager;

const row = (sourceId: string, over: Partial<AncLabPayloadRow>): AncLabPayloadRow => ({
  source: 'anc_lab',
  sourceId,
  resultDate: '2026-03-01',
  result: '36',
  labItemsName: 'Hct',
  ...over,
});

describe('listJourneyLabResults', () => {
  let db: DatabaseAdapter;
  let journeyId: string;

  beforeAll(() => {
    process.env.ENCRYPTION_KEY = generateKey();
  });

  beforeEach(async () => {
    db = await createTestDb();
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO hospitals (id, hcode, name, level, is_active, connection_status, created_at, updated_at)
       VALUES (?, '99905', 'รพ.ทดสอบอ่าน', 'F1', true, 'ONLINE', ?, ?)`,
      [HOSPITAL_ID, now, now],
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function seed(labResults: AncLabPayloadRow[]): Promise<void> {
    const payload = {
      type: 'anc_data',
      hospitalCode: '99905',
      patients: [
        {
          hn: 'HN-R1',
          name: 'นาง ทดสอบ อ่านผล',
          cid: '1100500090006',
          birthday: '1994-02-01',
          pregNo: 1,
          lmp: '2026-01-01T00:00:00Z',
          labResults,
        },
      ],
    } as WebhookAncPayload;
    await processAncWebhook(db, HOSPITAL_ID, payload, sse);
    journeyId = (await db.query<{ id: string }>('SELECT id FROM maternal_journeys'))[0].id;
  }

  it('returns decrypted results with their context and hospital', async () => {
    await seed([row('1', { unit: '%', labItemsCode: '101', gaWeeks: 12 })]);
    const [lab] = await listJourneyLabResults(db, journeyId);
    expect(lab).toMatchObject({
      canonicalTest: 'HCT',
      rawResult: '36',
      numericValue: 36,
      unit: '%',
      labItemsCode: '101',
      gaWeeks: 12,
      hospitalName: 'รพ.ทดสอบอ่าน',
      hcode: '99905',
      source: 'anc_lab',
      concealed: false,
      rawResultUnreadable: false,
    });
    expect(lab.resultDate).toMatch(/^2026-03-01/);
  });

  it('re-derives sensitive outcomes that are not in plaintext columns', async () => {
    await seed([
      row('1', { labItemsName: 'Anti HIV (ANC)', result: 'Positive' }),
      row('2', { labItemsName: 'CD4 Absolute', result: '320' }),
    ]);
    const labs = await listJourneyLabResults(db, journeyId);
    expect(labs.find((l) => l.canonicalTest === 'HIV')?.interpretation).toBe('positive');
    expect(labs.find((l) => l.canonicalTest === 'CD4')?.numericValue).toBe(320);
  });

  it('limits the rows to one hospital in the query when asked', async () => {
    await seed([row('1', {})]);
    expect(await listJourneyLabResults(db, journeyId, { onlyHospitalId: HOSPITAL_ID })).toHaveLength(1);
    expect(
      await listJourneyLabResults(db, journeyId, {
        onlyHospitalId: '00000000-0000-4000-8000-0000000000ff',
      }),
    ).toEqual([]);
  });

  it('returns unclassified results by their original names', async () => {
    await seed([row('1', { labItemsName: 'Ferritin', ancLabName: 'Ferritin', result: '30' })]);
    expect((await listJourneyLabResults(db, journeyId))[0]).toMatchObject({
      canonicalTest: null,
      labItemsName: 'Ferritin',
      rawResult: '30',
    });
  });

  it('returns a concealed result with no value and no inference', async () => {
    await seed([row('1', { labItemsName: 'Anti HIV (ANC)', result: 'ปกปิด' })]);
    expect((await listJourneyLabResults(db, journeyId))[0]).toMatchObject({
      concealed: true,
      rawResult: null,
      interpretation: 'concealed',
      rawResultUnreadable: false,
    });
  });

  it('orders newest first with undated results last', async () => {
    await seed([
      row('1', { resultDate: '2026-02-01' }),
      row('2', { resultDate: null }),
      row('3', { resultDate: '2026-04-01' }),
    ]);
    const labs = await listJourneyLabResults(db, journeyId);
    expect(labs.map((l) => l.resultDate?.slice(0, 7) ?? null)).toEqual([
      '2026-04',
      '2026-02',
      null,
    ]);
  });

  it('flags a value it cannot decrypt instead of showing ciphertext', async () => {
    await seed([row('1', {})]);
    await db.execute(`UPDATE cached_anc_lab_results SET raw_result = 'not-ciphertext'`);
    const warn = vi.spyOn(logger, 'warn');
    const [lab] = await listJourneyLabResults(db, journeyId);
    expect(lab.rawResult).toBeNull();
    expect(lab.rawResultUnreadable).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'anc_lab_result_decrypt_failed',
      expect.objectContaining({ journeyId, count: 1 }),
    );
  });

  it('returns the protected context fields decrypted', async () => {
    await seed([
      row('1', { normalReference: '12-16', abnormalFlag: 'N', ancResultNormalRaw: 'Y' }),
    ]);
    expect((await listJourneyLabResults(db, journeyId))[0]).toMatchObject({
      normalReference: '12-16',
      abnormalFlag: 'N',
      ancResultNormalRaw: 'Y',
      contextUnreadable: false,
    });
  });

  it('returns no context for a concealed result', async () => {
    await seed([row('1', { labItemsName: 'Anti HIV (ANC)', result: 'ปกปิด', abnormalFlag: 'Y' })]);
    expect((await listJourneyLabResults(db, journeyId))[0].abnormalFlag).toBeNull();
  });

  it('flags context it cannot decrypt rather than showing ciphertext or nothing', async () => {
    await seed([row('1', { abnormalFlag: 'N' })]);
    await db.execute(`UPDATE cached_anc_lab_results SET abnormal_flag = 'not-ciphertext'`);
    const warn = vi.spyOn(logger, 'warn');
    const [lab] = await listJourneyLabResults(db, journeyId);
    expect(lab.abnormalFlag).toBeNull();
    expect(lab.contextUnreadable).toBe(true);
    expect(lab.rawResultUnreadable).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      'anc_lab_result_decrypt_failed',
      expect.objectContaining({ count: 1 }),
    );
  });

  it('returns nothing for a journey with no labs', async () => {
    await seed([]);
    expect(await listJourneyLabResults(db, journeyId)).toEqual([]);
  });
});
