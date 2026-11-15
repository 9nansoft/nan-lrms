// Every fixture is a name or result form observed at a real hospital. ids and
// codes differ per site, so classification may only use names and value shape.
import { describe, it, expect } from 'vitest';
import {
  classifyAncLab,
  isClassifiableLabOrderName,
  interpretStoredResult,
  type AncLabClassifierInput,
} from '@/services/anc-lab-classifier';
import { ANC_LAB_ORDER_SQL_LIKE_TERMS, ANC_LAB_TESTS } from '@/config/anc-lab-canon';
import { plausibleHctPct } from '@/config/lab-plausibility';

const ancLab = (labItemsName: string | null, result: string, ancLabName?: string | null) =>
  classifyAncLab({ source: 'anc_lab', labItemsName, ancLabName: ancLabName ?? null, result });
const labOrder = (labItemsName: string, result: string) =>
  classifyAncLab({ source: 'lab_order', labItemsName, ancLabName: null, result });

describe('classifyAncLab — names', () => {
  it.each([['Hematocrit (HCT)'], ['Hct'], ['HCT1'], ['Hct anc 1'], ['Hematocrit 2']])(
    'classifies %s as hematocrit from a percent-shaped value',
    (name) => {
      const c = ancLab(name, '34.5');
      expect(c.canonicalTest).toBe('HCT');
      expect(c.numericValue).toBe(34.5);
    },
  );

  it.each([['HBs Ag'], ['HBsAg (ECLIA)'], ['HBs Ag anc 1']])('classifies %s as HBsAg', (name) => {
    expect(ancLab(name, 'Negative').canonicalTest).toBe('HBSAG');
  });

  it.each([['VDRL ( RPR )'], ['RPR (Blood)']])('classifies %s as non-treponemal', (name) => {
    expect(ancLab(name, 'NR').canonicalTest).toBe('VDRL_RPR');
  });

  it.each([['Treponema screening (CLIA)'], ['Anti Treponema Pallidum']])(
    'classifies %s as treponemal, kept apart from VDRL',
    (name) => {
      expect(ancLab(name, 'neg').canonicalTest).toBe('TREPONEMAL');
    },
  );

  it('keeps a bare "Syphilis" apart because its method is unknown', () => {
    expect(ancLab('Syphilis', 'neg').canonicalTest).toBe('SYPHILIS_UNSPECIFIED');
  });

  it.each([['Anti HIV (ANC)'], ['HIV-Ab'], ['HIV Ag/Ab'], ['Anti-HIV (Wonfo HIV1-2) วิธีที่ 2']])(
    'classifies %s as HIV',
    (name) => {
      expect(ancLab(name, 'NR').canonicalTest).toBe('HIV');
    },
  );

  it.each([
    ['DCIP', 'DCIP'],
    ['OF', 'OF'],
    ['[ปิด]OF Test', 'OF'],
    ['Rh.(D) grouping', 'RH'],
    ['Rh Typing', 'RH'],
    ['Urine Albumin (Strip)', 'URINE_ALBUMIN'],
    ['Urine Sugar (Strip)', 'URINE_SUGAR'],
  ])('classifies %s', (name, test) => {
    expect(ancLab(name, 'Negative').canonicalTest).toBe(test);
  });

  it.each([
    ['MCV', 'MCV'],
    ['CBC:MCV', 'MCV'],
  ])('classifies %s as MCV', (name, test) => {
    expect(ancLab(name, '78.2').canonicalTest).toBe(test);
  });

  it.each([['MCH'], ['CBC:MCH']])('classifies %s as MCH', (name) => {
    expect(ancLab(name, '26.1').canonicalTest).toBe('MCH');
  });

  it.each([['Blood group(ABO)'], ['ABO Grouping'], ['Blood grouping (slide method)']])(
    'classifies %s as blood group with a normalized value',
    (name) => {
      const c = ancLab(name, 'O');
      expect(c.canonicalTest).toBe('BLOOD_GROUP');
      expect(c.normalizedValue).toBe('O');
    },
  );

  it.each([
    ['A-', 'A-'],
    ['AB+', 'AB+'],
    ['b+', 'B+'],
    ['O Rh-', 'O-'],
    ['O', 'O'],
  ])('keeps the Rh sign of blood group %s as %s', (result, expected) => {
    expect(ancLab('ABO Grouping', result).normalizedValue).toBe(expected);
  });

  it.each([['01.Hb typing'], ['Hb typing']])('classifies %s as Hb typing, not Hb', (name) => {
    expect(ancLab(name, 'A2A').canonicalTest).toBe('HB_TYPING');
  });

  it.each([
    ['GST-DTX', 'GST'],
    ['OGTT ( ก่อนกินน้ำตาล )', 'OGTT_FASTING'],
    ['FBS ( ก่อนกินน้ำตาล )', 'OGTT_FASTING'],
    ['OGTT 1 hr.', 'OGTT_1H'],
  ])('classifies %s from a glucose value', (name, test) => {
    expect(ancLab(name, '142').canonicalTest).toBe(test);
  });

  it('counts DTX 1 as OGTT only when the ANC catalogue name says OGTT', () => {
    expect(ancLab('DTX 1', '142', 'OGTT 75 g').canonicalTest).toBe('OGTT_UNSPECIFIED');
    expect(ancLab('DTX 1', '142', 'น้ำตาลปลายนิ้ว').canonicalTest).toBeNull();
    expect(ancLab('DTX 2', '142', null).canonicalTest).toBeNull();
  });

  it('classifies CD4 Absolute numerically', () => {
    expect(ancLab('CD4 Absolute', '512').canonicalTest).toBe('CD4');
  });

  it('accepts hemoglobin only from lab orders, where hemoglobin really lives', () => {
    for (const name of ['Hemoglobin', 'Hb', 'Hemoglobin (HGB)', 'CBC:Hb']) {
      expect(labOrder(name, '11.2').canonicalTest).toBe('HB');
    }
    // No ANC catalogue has hemoglobin, and HB there can mean Hepatitis B.
    expect(ancLab('HB', '11.2').canonicalTest).toBeNull();
  });
});

describe('classifyAncLab — traps', () => {
  it.each([['Hct (grade)'], ['HBe Ag'], ['Hb A1C'], ['CBC (AUTOMATION)']])(
    'leaves %s unclassified and keeps its raw value',
    (name) => {
      const c = ancLab(name, '5.4');
      expect(c.canonicalTest).toBeNull();
      expect(c.rawResult).toBe('5.4');
    },
  );

  describe('person_anc thalassemia fields (coding confirmed in lookup_normal at 3 sites)', () => {
    const registered = (ancLabName: string, result: string) =>
      classifyAncLab({ source: 'person_anc', labItemsName: null, ancLabName, result });

    it.each([
      ['Thalassemia: OF (ภรรยา)', 'OF'],
      ['Thalassemia: DCIP (ภรรยา)', 'DCIP'],
      ['Thalassemia: Hb typing (ภรรยา)', 'HB_TYPING'],
      ['Thalassemia: Alpha-1 (ภรรยา)', 'ALPHA1'],
      ['Thalassemia: OF (สามี)', 'PARTNER_OF'],
      ['Thalassemia: DCIP (สามี)', 'PARTNER_DCIP'],
      ['Thalassemia: Hb typing (สามี)', 'PARTNER_HB_TYPING'],
      ['Thalassemia: Alpha-1 (สามี)', 'PARTNER_ALPHA1'],
    ])('reads %s as %s, where Y is normal and N is abnormal', (label, test) => {
      const normal = registered(label, 'Y');
      expect(normal.canonicalTest).toBe(test);
      expect(normal.interpretation).toBe('negative');
      expect(normal.normalizedValue).toBe('ปกติ');
      expect(normal.rawResult).toBe('Y');

      const abnormal = registered(label, 'N');
      expect(abnormal.canonicalTest).toBe(test);
      expect(abnormal.interpretation).toBe('abnormal');
      expect(abnormal.normalizedValue).toBe('ผิดปกติ');
    });

    it.each([
      ['Thalassemia: รหัสผลตรวจ (ภรรยา)', 'THAL_RESULT'],
      ['Thalassemia: รหัสผลตรวจ (สามี)', 'PARTNER_THAL_RESULT'],
    ])('reads %s as %s from the thalassaemia_result ids', (label, test) => {
      expect(registered(label, '1')).toMatchObject({
        canonicalTest: test,
        interpretation: 'negative',
        normalizedValue: 'ปกติ',
      });
      expect(registered(label, '2')).toMatchObject({
        canonicalTest: test,
        interpretation: 'abnormal',
        normalizedValue: 'ผิดปกติ',
      });
    });

    it.each([['0'], ['3'], ['4']])('does not read result id %s as a result', (id) => {
      expect(registered('Thalassemia: รหัสผลตรวจ (ภรรยา)', id)).toMatchObject({
        canonicalTest: 'THAL_RESULT',
        interpretation: 'unknown',
        normalizedValue: null,
      });
    });

    it('keeps an unrecognised flag unknown', () => {
      expect(registered('Thalassemia: DCIP (ภรรยา)', 'X').interpretation).toBe('unknown');
    });

    it('does not classify a field it has no definition for', () => {
      const c = registered('Thalassemia: something new', 'N');
      expect(c.canonicalTest).toBeNull();
      expect(c.classificationNote).toBe('no_rule');
      expect(c.interpretation).toBe('unknown');
    });

    it.each([
      ['ALPHA1'],
      ['THAL_RESULT'],
      ['PARTNER_OF'],
      ['PARTNER_DCIP'],
      ['PARTNER_HB_TYPING'],
      ['PARTNER_ALPHA1'],
      ['PARTNER_THAL_RESULT'],
    ] as const)('keeps the %s outcome out of plaintext columns', (test) => {
      expect(ANC_LAB_TESTS[test].sensitive).toBe(true);
    });

    it('re-reads a stored partner result to the same decoded word', () => {
      expect(interpretStoredResult('PARTNER_DCIP', 'N')).toMatchObject({
        interpretation: 'abnormal',
        normalizedValue: 'ผิดปกติ',
      });
    });

    it('gives no sensitive test a per-source reading, which re-reads cannot see', () => {
      const offending = Object.entries(ANC_LAB_TESTS).filter(
        ([, definition]) => definition.sensitive && definition.sourceShapes,
      );
      expect(offending).toEqual([]);
    });

    it('applies the Y/N coding only to registered fields, not to a lab result', () => {
      expect(labOrder('OF', 'N').interpretation).toBe('negative');
      expect(labOrder('OF', 'Y').interpretation).toBe('unknown');
    });
  });

  it('does not read an unknown lab into any test', () => {
    const c = ancLab('Ferritin', '30');
    expect(c.canonicalTest).toBeNull();
    expect(c.classificationNote).toBe('no_rule');
    expect(c.interpretation).toBe('unknown');
  });

  it('prefers the lab item name over the ANC catalogue name', () => {
    expect(ancLab('HBs Ag', 'neg', 'Hct').canonicalTest).toBe('HBSAG');
  });

  it('falls back to the ANC catalogue name when no lab item is mapped', () => {
    expect(ancLab(null, '33', 'HCT2').canonicalTest).toBe('HCT');
    expect(ancLab(null, 'NR', 'HIV1').canonicalTest).toBe('HIV');
  });

  it('refuses an "Anti HIV" row holding hematocrit-shaped numbers (11011 id 6)', () => {
    const c = ancLab('Anti HIV', '36');
    expect(c.canonicalTest).toBeNull();
    expect(c.classificationNote).toBe('value_shape_mismatch');
    expect(c.rawResult).toBe('36');
    expect(c.numericValue).toBeNull();
  });

  it('refuses a "Hematocrit 2" row holding Positive/Negative (11011 id 8)', () => {
    const c = ancLab('Hematocrit 2', 'Positive');
    expect(c.canonicalTest).toBeNull();
    expect(c.classificationNote).toBe('value_shape_mismatch');
    expect(c.interpretation).toBe('unknown');
  });

  it('refuses a hemoglobin that is really a hematocrit', () => {
    expect(labOrder('Hb', '36').canonicalTest).toBeNull();
  });

  it('refuses a hematocrit no patient can have', () => {
    expect(ancLab('Hct', '150').canonicalTest).toBeNull();
  });

  it('refuses a blood group that is not a blood group', () => {
    expect(ancLab('ABO Grouping', 'Positive').canonicalTest).toBeNull();
  });
});

describe('classifyAncLab — result forms', () => {
  it.each([
    ['neg'],
    ['Negative'],
    ['negative'],
    ['NR'],
    ['N'],
    ['ne'],
    ['ปกติ'],
    ['NONREACT  <0.030'],
  ])('reads %s as negative', (result) => {
    expect(ancLab('HIV-Ab', result).interpretation).toBe('negative');
  });

  it.each([['pos'], ['Positive'], ['positive'], ['Possitive'], ['+']])(
    'reads %s as positive',
    (result) => {
      expect(ancLab('HIV-Ab', result).interpretation).toBe('positive');
    },
  );

  it.each([
    ['Reactive'],
    ['reactive'],
    ['R'],
    ['พบ'],
    ['Pos 1:8'],
    ['pos'],
    ['2+'],
    ['3+'],
    ['++'],
    ['++++'],
  ])('reads the positive form %s as positive', (result) => {
    expect(ancLab('HBs Ag', result).interpretation).toBe('positive');
  });

  it.each([['ไม่พบ'], ['Neg 1:2'], ['Non-reactive'], ['non reactive'], ['NONREACTIVE']])(
    'reads %s as negative, never as the positive form it contains',
    (result) => {
      expect(ancLab('HBs Ag', result).interpretation).toBe('negative');
    },
  );

  it.each([['W+'], ['w+']])(
    'reads the weak form %s as abnormal, not positive or negative',
    (result) => {
      expect(ancLab('HBs Ag', result).interpretation).toBe('abnormal');
    },
  );

  it('reads ผิดปกติ as abnormal, which is not the same as positive', () => {
    expect(ancLab('HBs Ag', 'ผิดปกติ').interpretation).toBe('abnormal');
  });

  it.each([['null'], ['NULL'], [''], ['   ']])('reads %j as missing', (result) => {
    const c = ancLab('HBs Ag', result);
    expect(c.interpretation).toBe('missing');
    expect(c.rawResult).toBeNull();
    expect(c.canonicalTest).toBe('HBSAG');
  });

  it('treats a missing result input as missing', () => {
    const input: AncLabClassifierInput = {
      source: 'anc_lab',
      labItemsName: 'HBs Ag',
      ancLabName: null,
      result: null,
    };
    expect(classifyAncLab(input).interpretation).toBe('missing');
  });

  it.each([['-'], ['0.0 (C1N)'], ['Reactive?'], ['weakly seen']])(
    'keeps the unrecognised form %s as unknown, never guessed',
    (result) => {
      const c = ancLab('HIV-Ab', result);
      expect(c.canonicalTest).toBe('HIV');
      expect(c.interpretation).toBe('unknown');
    },
  );

  it('keeps a test classified when its numeric value is only an ambiguous dash', () => {
    const c = ancLab('Hct', '-');
    expect(c.canonicalTest).toBe('HCT');
    expect(c.interpretation).toBe('unknown');
    expect(c.numericValue).toBeNull();
  });

  it('stores nothing for a concealed result and never infers one', () => {
    const c = ancLab('Anti HIV (ANC)', ' ปกปิด ');
    expect(c.concealed).toBe(true);
    expect(c.rawResult).toBeNull();
    expect(c.interpretation).toBe('concealed');
    expect(c.numericValue).toBeNull();
    expect(c.canonicalTest).toBe('HIV');
  });

  it('marks a concealed result on an unclassified lab too', () => {
    const c = ancLab('Ferritin', 'ปกปิด');
    expect(c.concealed).toBe(true);
    expect(c.rawResult).toBeNull();
  });

  it('parses percent and decimal-comma hematocrits', () => {
    expect(ancLab('Hct', '36%').numericValue).toBe(36);
    expect(ancLab('Hct', '36,5').numericValue).toBe(36.5);
  });

  it.each([
    ['CD4 Absolute', '1,200'],
    ['CD4 Absolute', '12,345'],
    ['Hct', '1,200'],
  ])('does not read the thousands separator in %s %s as a decimal point', (name, result) => {
    const c = ancLab(name, result);
    expect(c.numericValue).toBeNull();
    expect(c.canonicalTest).toBeNull();
    expect(c.classificationNote).toBe('value_shape_mismatch');
    expect(c.rawResult).toBe(result);
  });

  describe('Rh accepts only explicit signs', () => {
    it('keeps a bare dash as unknown because it often means not done', () => {
      const c = ancLab('Rh Typing', '-');
      expect(c.canonicalTest).toBe('RH');
      expect(c.interpretation).toBe('unknown');
    });

    it.each([['ปกติ'], ['N'], ['NR'], ['ne'], ['Reactive'], ['W+'], ['ผิดปกติ'], ['2+']])(
      'keeps Rh %s as unknown because normal is not Rh-negative',
      (result) => {
        const c = ancLab('Rh Typing', result);
        expect(c.canonicalTest).toBe('RH');
        expect(c.interpretation).toBe('unknown');
      },
    );

    it.each([['neg'], ['Negative'], ['Rh neg'], ['Rh Negative']])(
      'reads a lab order of Rh %s as negative',
      (result) => {
        expect(labOrder('Rh Typing', result).interpretation).toBe('negative');
      },
    );

    // 11011's ANC form: NEGATIVE/neg on about 99% of 2,131 rows, while its own
    // lab reports Rh neg on 0.4%. There the word means nothing was abnormal.
    it.each([['NEGATIVE'], ['neg'], ['Negative']])(
      'keeps %s on the ANC form unknown because it may only mean not abnormal',
      (result) => {
        const c = ancLab('Rh .(D) typing ( slide method)', result);
        expect(c.canonicalTest).toBe('RH');
        expect(c.interpretation).toBe('unknown');
        expect(c.classificationNote).toBe('rh_word_on_form');
        expect(c.rawResult).toBe(result);
      },
    );

    it('marks only the bare negative word, not any other unreadable Rh', () => {
      expect(ancLab('Rh Typing', '-').classificationNote).toBeNull();
      expect(ancLab('Rh Typing', 'ปกติ').classificationNote).toBeNull();
    });

    it.each([['Rh neg'], ['Rh Negative']])(
      'reads an ANC form that names the factor, %s, as negative',
      (result) => {
        expect(ancLab('Rh Typing', result).interpretation).toBe('negative');
      },
    );

    it.each([['pos'], ['Positive'], ['+'], ['post'], ['Rh Pos'], ['Rh Positive']])(
      'reads Rh %s as positive from either source',
      (result) => {
        expect(ancLab('Rh Typing', result).interpretation).toBe('positive');
        expect(labOrder('Rh Typing', result).interpretation).toBe('positive');
      },
    );
  });

  it('keeps the original text as the raw result', () => {
    expect(ancLab('HIV-Ab', ' NONREACT  <0.030 ').rawResult).toBe('NONREACT  <0.030');
  });
});

describe('isClassifiableLabOrderName', () => {
  it('accepts tests the app needs from lab orders', () => {
    expect(isClassifiableLabOrderName('Hemoglobin (HGB)')).toBe(true);
    expect(isClassifiableLabOrderName('HBs Ag')).toBe(true);
  });

  it('rejects traps and unrelated tests', () => {
    expect(isClassifiableLabOrderName('Hb A1C')).toBe(false);
    expect(isClassifiableLabOrderName('Creatinine')).toBe(false);
    expect(isClassifiableLabOrderName('')).toBe(false);
  });
});

describe('interpretStoredResult', () => {
  it('re-derives a sensitive outcome from the decrypted raw value', () => {
    expect(interpretStoredResult('HIV', 'Negative').interpretation).toBe('negative');
    expect(interpretStoredResult('CD4', '512').numericValue).toBe(512);
  });
});

describe('anc-lab canon', () => {
  it('marks HIV and CD4 sensitive so outcomes stay out of plaintext columns', () => {
    expect(ANC_LAB_TESTS.HIV.sensitive).toBe(true);
    expect(ANC_LAB_TESTS.CD4.sensitive).toBe(true);
    expect(ANC_LAB_TESTS.HCT.sensitive).toBeFalsy();
  });

  it('keeps SQL pre-filter terms safe to interpolate', () => {
    for (const term of ANC_LAB_ORDER_SQL_LIKE_TERMS) {
      expect(term).toMatch(/^[a-z0-9:%() ]+$/);
    }
  });

  it('pre-filters every hemoglobin spelling the classifier accepts', () => {
    const hits = (name: string): boolean =>
      ANC_LAB_ORDER_SQL_LIKE_TERMS.some((t) =>
        new RegExp(`^${t.replace(/[()]/g, '\\$&').replace(/%/g, '.*')}$`).test(name.toLowerCase()),
      );
    for (const name of ['Hemoglobin', 'Hb', 'Hemoglobin (HGB)', 'CBC:Hb', 'Hct', 'HIV-Ab']) {
      expect(hits(name)).toBe(true);
    }
  });
});

describe('plausibleHctPct', () => {
  it('keeps severe anemia and drops impossible values', () => {
    expect(plausibleHctPct(18)).toBe(18);
    expect(plausibleHctPct(150)).toBeNull();
    expect(plausibleHctPct(0)).toBeNull();
    expect(plausibleHctPct(null)).toBeNull();
  });
});
