// Patient-safety display rules: what may be coloured, and what must never
// read as normal. Everything on the panel is decided here.
import { describe, it, expect } from 'vitest';
import type { JourneyLabResult } from '@/services/anc-lab-results';
import { ANC_LAB_TESTS, type AncLabTest } from '@/config/anc-lab-canon';
import {
  ANC_LAB_PANEL_GROUPS,
  ANC_LAB_RH_FORM_NOTE,
  ANC_LAB_SEROLOGY_WITHHELD_LABEL,
  ANC_LAB_TEST_LABEL,
} from '@/config/anc-lab-display';
import {
  buildJourneyLabPanel,
  codedTileStatus,
  presentLabResult,
  serologyTextTileStatus,
  serologyTile,
} from '@/services/anc-lab-presentation';

let seq = 0;
function lab(over: Partial<JourneyLabResult> = {}): JourneyLabResult {
  seq += 1;
  return {
    id: `r${seq}`,
    hospitalId: 'h1',
    hospitalName: 'รพ.หนึ่ง',
    hcode: '11001',
    source: 'anc_lab',
    resultDate: '2026-03-01',
    gaWeeks: 12,
    canonicalTest: 'HBSAG',
    classificationNote: null,
    ancLabName: 'HBsAg',
    labItemsName: 'HBsAg',
    labItemsCode: '1',
    rawResult: 'Neg',
    rawResultUnreadable: false,
    numericValue: null,
    normalizedValue: null,
    interpretation: 'negative',
    unit: null,
    normalReference: null,
    abnormalFlag: null,
    ancResultNormalRaw: null,
    concealed: false,
    contextUnreadable: false,
    syncedAt: '2026-03-02T01:00:00.000Z',
    ...over,
  };
}
const hct = (value: number, over: Partial<JourneyLabResult> = {}) =>
  lab({
    canonicalTest: 'HCT',
    rawResult: String(value),
    numericValue: value,
    interpretation: null,
    unit: '%',
    ...over,
  });

describe('presentLabResult', () => {
  it('shows a concealed result with no value', () => {
    expect(
      presentLabResult(
        lab({ concealed: true, rawResult: null, interpretation: 'concealed', abnormalFlag: 'Y' }),
      ),
    ).toMatchObject({ tone: 'concealed', value: null, stateLabel: 'ปกปิดผล' });
  });

  it('says a value could not be read, rather than no result or normal', () => {
    expect(
      presentLabResult(
        lab({ rawResultUnreadable: true, rawResult: null, interpretation: 'negative' }),
      ),
    ).toMatchObject({ tone: 'unreadable', value: null, stateLabel: 'อ่านข้อมูลไม่ได้' });
  });

  it('never calls a result normal when its flag or reference could not be read', () => {
    const p = presentLabResult(lab({ contextUnreadable: true }));
    expect(p.tone).toBe('unreadable');
    expect(p.value).toBe('Neg');
    expect(p.stateLabel).toBe('อ่านข้อมูลไม่ได้');
  });

  it('keeps a stated abnormal result abnormal even when its context is unreadable', () => {
    const p = presentLabResult(
      lab({ contextUnreadable: true, interpretation: 'positive', rawResult: 'Pos' }),
    );
    expect(p.tone).toBe('abnormal');
    expect(p.contextUnreadable).toBe(true);
  });

  it('shows missing as no result', () => {
    expect(presentLabResult(lab({ rawResult: null, interpretation: 'missing' }))).toMatchObject({
      tone: 'none',
      value: null,
      stateLabel: 'ไม่มีผล',
    });
  });

  it('shows unknown as its raw text, never normal', () => {
    expect(presentLabResult(lab({ rawResult: 'weak', interpretation: 'unknown' }))).toMatchObject({
      tone: 'neutral',
      value: 'weak',
    });
  });

  it.each(['positive', 'abnormal'] as const)('flags interpretation %s', (interpretation) => {
    expect(presentLabResult(lab({ interpretation, rawResult: 'x' })).tone).toBe('abnormal');
  });

  it('colours a qualitative negative as normal', () => {
    expect(presentLabResult(lab()).tone).toBe('normal');
  });

  it('flags only what HOSxP marked: no numeric threshold is applied', () => {
    expect(presentLabResult(hct(18)).tone).toBe('neutral');
    expect(presentLabResult(hct(18)).value).toBe('18');
    expect(presentLabResult(hct(36, { abnormalFlag: ' y ' })).tone).toBe('abnormal');
    expect(presentLabResult(hct(36, { abnormalFlag: 'N' })).tone).toBe('neutral');
  });

  it('shows a blood group by its normalised value without a colour', () => {
    expect(
      presentLabResult(
        lab({
          canonicalTest: 'BLOOD_GROUP',
          rawResult: 'group a',
          normalizedValue: 'A',
          interpretation: null,
        }),
      ),
    ).toMatchObject({ tone: 'neutral', value: 'A' });
  });

  it('reads Rh the other way round: positive is the usual result', () => {
    const rh = (interpretation: 'positive' | 'negative', rawResult: string) =>
      presentLabResult(lab({ canonicalTest: 'RH', interpretation, rawResult })).tone;
    expect(rh('positive', 'Pos')).toBe('normal');
    expect(rh('negative', 'Neg')).toBe('abnormal');
  });

  it('never colours an unclassified row, whatever HOSxP flagged', () => {
    for (const over of [
      { interpretation: 'negative' as const },
      { interpretation: 'positive' as const },
      { abnormalFlag: 'Y' },
    ]) {
      const p = presentLabResult(lab({ canonicalTest: null, rawResult: '30', ...over }));
      expect(p.tone).toBe('neutral');
      expect(p.value).toBe('30');
    }
  });

  it('still reports HOSxP flag on an unclassified row, as words', () => {
    expect(
      presentLabResult(lab({ canonicalTest: null, rawResult: '30', abnormalFlag: 'Y' }))
        .hosxpFlagged,
    ).toBe(true);
  });
});

describe('an Rh word on the ANC form that cannot be trusted', () => {
  const rh = (over: Partial<JourneyLabResult>) =>
    lab({ canonicalTest: 'RH', rawResult: 'NEGATIVE', interpretation: 'unknown', ...over });

  it('stays grey, keeps the text and warns to check the lab result', () => {
    const p = presentLabResult(rh({ classificationNote: 'rh_word_on_form' }));
    expect(p.tone).toBe('neutral');
    expect(p.value).toBe('NEGATIVE');
    expect(p.note).toBe(ANC_LAB_RH_FORM_NOTE);
  });

  it('adds no warning to other unreadable Rh text', () => {
    expect(presentLabResult(rh({ rawResult: '-' })).note).toBeNull();
  });

  it('adds no warning to a result it could read', () => {
    const p = presentLabResult(rh({ rawResult: 'Rh neg', interpretation: 'negative' }));
    expect(p.tone).toBe('abnormal');
    expect(p.note).toBeNull();
  });
});

describe('thalassemia flags from the ANC register', () => {
  const flag = (over: Partial<JourneyLabResult>) =>
    lab({ source: 'person_anc', canonicalTest: 'PARTNER_DCIP', resultDate: null, ...over });

  it('shows the decoded word for abnormal, in red, without repeating it', () => {
    const p = presentLabResult(
      flag({ rawResult: 'N', normalizedValue: 'ผิดปกติ', interpretation: 'abnormal' }),
    );
    expect(p).toMatchObject({ tone: 'abnormal', value: 'ผิดปกติ', stateLabel: null });
  });

  it('shows the decoded word for normal, in green', () => {
    const p = presentLabResult(
      flag({ rawResult: 'Y', normalizedValue: 'ปกติ', interpretation: 'negative' }),
    );
    expect(p).toMatchObject({ tone: 'normal', value: 'ปกติ', stateLabel: null });
  });

  it('keeps the abnormal label when the value is a different text', () => {
    const p = presentLabResult(lab({ rawResult: 'Pos', interpretation: 'positive' }));
    expect(p).toMatchObject({ tone: 'abnormal', value: 'Pos', stateLabel: 'ผิดปกติ' });
  });

  it('lists a partner result under its own heading, not the woman’s', () => {
    const panel = buildJourneyLabPanel([
      flag({ rawResult: 'N', normalizedValue: 'ผิดปกติ', interpretation: 'abnormal' }),
    ]);
    expect(panel.groups.map((g) => g.id)).toEqual(['thalassemia_partner']);
  });
});

describe('buildJourneyLabPanel', () => {
  it('places every canonical test in exactly one group, with a label', () => {
    const grouped = ANC_LAB_PANEL_GROUPS.flatMap((g) => g.tests);
    expect([...grouped].sort()).toEqual((Object.keys(ANC_LAB_TESTS) as AncLabTest[]).sort());
    for (const test of grouped) expect(ANC_LAB_TEST_LABEL[test]).toBeTruthy();
  });

  it('shows the newest result per test and keeps older ones visible', () => {
    const newest = hct(30, { resultDate: '2026-05-01' });
    const older = hct(36, { resultDate: '2026-02-01' });
    const panel = buildJourneyLabPanel([newest, older]);
    const group = panel.groups.find((g) => g.id === 'hematology');
    expect(group?.tests).toHaveLength(1);
    expect(group?.tests[0].latest).toBe(newest);
    expect(group?.tests[0].older).toEqual([older]);
  });

  it('prefers an actual result over a newer empty row', () => {
    const empty = lab({ rawResult: null, interpretation: 'missing', resultDate: '2026-05-01' });
    const real = lab({ resultDate: '2026-02-01' });
    const [test] = buildJourneyLabPanel([empty, real]).groups[0].tests;
    expect(test.latest).toBe(real);
    expect(test.older).toEqual([]);
  });

  it('does not skip a newer concealed or unreadable result', () => {
    const concealed = lab({
      concealed: true,
      rawResult: null,
      interpretation: 'concealed',
      resultDate: '2026-05-01',
    });
    const real = lab({ resultDate: '2026-02-01' });
    const [test] = buildJourneyLabPanel([concealed, real]).groups[0].tests;
    expect(test.latest).toBe(concealed);
  });

  it('omits groups with nothing on file', () => {
    expect(buildJourneyLabPanel([hct(30)]).groups.map((g) => g.id)).toEqual(['hematology']);
  });

  it('lists unclassified rows separately, in order', () => {
    const a = lab({ canonicalTest: null, labItemsName: 'Ferritin', rawResult: '30' });
    const b = lab({ canonicalTest: null, labItemsName: 'TSH', rawResult: '1' });
    expect(buildJourneyLabPanel([a, hct(30), b]).other).toEqual([a, b]);
  });

  it('builds a chronological trend from repeated numeric values only', () => {
    const panel = buildJourneyLabPanel([
      hct(30, { resultDate: '2026-05-01' }),
      hct(0, {
        rawResult: null,
        numericValue: null,
        concealed: true,
        interpretation: 'concealed',
        resultDate: '2026-04-01',
      }),
      hct(33, { resultDate: '2026-03-01' }),
      hct(35, { resultDate: null }),
    ]);
    expect(panel.trends).toHaveLength(1);
    expect(panel.trends[0]).toMatchObject({ test: 'HCT', unit: '%' });
    expect(panel.trends[0].points.map((p) => p.value)).toEqual([33, 30]);
  });

  it('leaves out a trend for a single reading and for unreadable rows', () => {
    expect(buildJourneyLabPanel([hct(30)]).trends).toEqual([]);
    expect(
      buildJourneyLabPanel([
        hct(30),
        hct(31, { rawResultUnreadable: true, resultDate: '2026-02-01' }),
      ]).trends,
    ).toEqual([]);
  });

  it('lists core tests with no result on file', () => {
    const ids = buildJourneyLabPanel([hct(30)]).missing.map((m) => m.id);
    expect(ids).not.toContain('hb_hct');
    expect(ids).toEqual(expect.arrayContaining(['hbsag', 'syphilis', 'hiv', 'blood_group', 'rh']));
  });

  it('counts any accepted test towards a core item', () => {
    const ids = buildJourneyLabPanel([
      lab({ canonicalTest: 'TREPONEMAL', rawResult: 'NR', interpretation: 'negative' }),
    ]).missing.map((m) => m.id);
    expect(ids).not.toContain('syphilis');
  });

  it('counts empty rows as no result, but concealed and unreadable as on file', () => {
    const missing = (over: Partial<JourneyLabResult>) =>
      buildJourneyLabPanel([lab({ canonicalTest: 'HIV', ...over })]).missing.map((m) => m.id);
    expect(missing({ rawResult: null, interpretation: 'missing' })).toContain('hiv');
    expect(
      missing({ rawResult: null, concealed: true, interpretation: 'concealed' }),
    ).not.toContain('hiv');
    expect(
      missing({ rawResult: null, rawResultUnreadable: true, interpretation: 'unknown' }),
    ).not.toContain('hiv');
  });

  it('reports the latest sync per hospital', () => {
    const panel = buildJourneyLabPanel([
      hct(30, { syncedAt: '2026-03-02T01:00:00.000Z' }),
      hct(31, { syncedAt: '2026-03-05T01:00:00.000Z' }),
      hct(32, { hospitalId: 'h2', hospitalName: 'รพ.สอง', syncedAt: '2026-03-01T01:00:00.000Z' }),
    ]);
    expect(panel.sources).toEqual([
      { hospitalName: 'รพ.หนึ่ง', lastSyncedAt: '2026-03-05T01:00:00.000Z' },
      { hospitalName: 'รพ.สอง', lastSyncedAt: '2026-03-01T01:00:00.000Z' },
    ]);
  });
});

describe('codedTileStatus', () => {
  it.each([
    [null, 'missing'],
    ['', 'missing'],
    ['POS', 'abnormal'],
    ['NEG', 'normal'],
    ['PENDING', 'neutral'],
    ['Negative', 'neutral'],
    ['Non-reactive', 'neutral'],
  ])('reads %j as %s on a POS/NEG tile', (value, status) => {
    expect(codedTileStatus(value, 'NEG', 'POS')).toBe(status);
  });

  it('reads Rh the other way round', () => {
    expect(codedTileStatus('NEG', 'POS', 'NEG')).toBe('abnormal');
    expect(codedTileStatus('POS', 'POS', 'NEG')).toBe('normal');
    expect(codedTileStatus('ปกติ', 'POS', 'NEG')).toBe('neutral');
  });
});

describe('a positive earlier in this pregnancy', () => {
  const NEG = {
    rawResult: 'Negative',
    interpretation: 'negative' as const,
    resultDate: '2026-05-01',
  };
  const POS = {
    rawResult: 'Positive',
    interpretation: 'positive' as const,
    resultDate: '2026-02-01',
  };
  const summary = (rows: JourneyLabResult[]) => buildJourneyLabPanel(rows).groups[0].tests[0];

  it.each<[AncLabTest]>([
    ['HBSAG'],
    ['HIV'],
    ['VDRL_RPR'],
    ['TREPONEMAL'],
    ['SYPHILIS_UNSPECIFIED'],
  ])('marks a later negative %s and never shows it as normal', (canonicalTest) => {
    const s = summary([lab({ canonicalTest, ...NEG }), lab({ canonicalTest, ...POS })]);
    expect(s.earlierPositive?.resultDate).toBe('2026-02-01');
    expect(s.latest.interpretation).toBe('negative');
    const p = presentLabResult(s.latest, { earlierPositive: true });
    expect(p.tone).not.toBe('normal');
    expect(p.value).toBe('Negative');
    expect(p.stateLabel).toBeTruthy();
  });

  it('uses the most recent earlier positive', () => {
    const s = summary([lab(NEG), lab({ ...POS, resultDate: '2026-04-01' }), lab(POS)]);
    expect(s.earlierPositive?.resultDate).toBe('2026-04-01');
  });

  it('adds nothing when the latest result is itself positive', () => {
    const s = summary([lab({ ...POS, resultDate: '2026-05-01' }), lab(POS)]);
    expect(s.earlierPositive).toBeNull();
  });

  it('adds nothing when no earlier result was positive', () => {
    expect(
      summary([lab(NEG), lab({ ...NEG, resultDate: '2026-02-01' })]).earlierPositive,
    ).toBeNull();
  });

  it('does not apply to DCIP', () => {
    const s = summary([
      lab({ canonicalTest: 'DCIP', ...NEG }),
      lab({ canonicalTest: 'DCIP', ...POS }),
    ]);
    expect(s.earlierPositive).toBeNull();
  });

  it('keeps an abnormal latest result red', () => {
    const r = lab({ rawResult: 'ผิดปกติ', interpretation: 'abnormal' });
    expect(presentLabResult(r, { earlierPositive: true }).tone).toBe('abnormal');
  });
});

describe('core tests with a result that failed the shape check', () => {
  const mismatch = (labItemsName: string, rawResult: string) =>
    lab({
      canonicalTest: null,
      classificationNote: 'value_shape_mismatch',
      labItemsName,
      ancLabName: labItemsName,
      rawResult,
      interpretation: 'unknown',
    });
  const missingIds = (rows: JourneyLabResult[]) =>
    buildJourneyLabPanel(rows).missing.map((m) => m.id);

  it.each([
    ['HBs Ag', '1.5', 'hbsag'],
    ['Hct', '0.36', 'hb_hct'],
    ['Anti HIV', '36', 'hiv'],
  ])('does not call %s %s missing', (name, raw, id) => {
    expect(missingIds([mismatch(name, raw)])).not.toContain(id);
  });

  it('still reports the tests with nothing on file', () => {
    expect(missingIds([mismatch('HBs Ag', '1.5')])).toContain('hiv');
  });

  it('does not count an unrelated unclassified result', () => {
    const ferritin = lab({
      canonicalTest: null,
      classificationNote: 'no_rule',
      labItemsName: 'Ferritin',
      ancLabName: 'Ferritin',
      rawResult: '30',
      interpretation: 'unknown',
    });
    expect(missingIds([ferritin])).toContain('hbsag');
  });
});

describe('serologyTile', () => {
  it('shows a withheld result as restricted, never as not yet recorded', () => {
    expect(serologyTile('Positive', 'HIV', true)).toEqual({
      value: null,
      status: 'concealed',
      statusLabel: ANC_LAB_SEROLOGY_WITHHELD_LABEL,
    });
    expect(serologyTile(null, 'HIV', true).status).toBe('concealed');
  });

  it('reads a visible result as before', () => {
    expect(serologyTile('Positive', 'HIV', false)).toEqual({
      value: 'Positive',
      status: 'abnormal',
      statusLabel: null,
    });
    expect(serologyTile(null, 'VDRL_RPR', undefined).status).toBe('missing');
  });
});

describe('serologyTextTileStatus', () => {
  describe.each<[AncLabTest]>([['HIV'], ['VDRL_RPR']])('%s', (test) => {
    it.each([
      [null, 'missing'],
      ['', 'missing'],
      ['POS', 'abnormal'],
      ['Positive', 'abnormal'],
      ['Reactive', 'abnormal'],
      ['Pos 1:8', 'abnormal'],
      ['ผิดปกติ', 'abnormal'],
      ['W+', 'abnormal'],
      ['NEG', 'normal'],
      ['neg', 'normal'],
      ['Non-reactive', 'normal'],
      ['-', 'neutral'],
      ['1:8', 'neutral'],
      ['PENDING', 'neutral'],
      ['ดูผลในใบรายงาน', 'neutral'],
    ])('reads %j as %s', (value, status) => {
      expect(serologyTextTileStatus(value, test)).toBe(status);
    });
  });
});
