/**
 * ANC laboratory canon: what each test is and how HOSxP names and writes it.
 *
 * Hospitals edit `anc_lab` themselves, so ids and codes differ per site and
 * `anc_lab_code` is unreliable (HB means Hepatitis B at some). Only names and
 * value shape are used. To support a newly seen spelling or result form, add
 * a row here; the logic in src/services/anc-lab-classifier.ts stays unchanged.
 */
import {
  HB_G_DL_PLAUSIBLE_MAX,
  HCT_PCT_PLAUSIBLE_MAX,
  HCT_PCT_PLAUSIBLE_MIN,
} from './lab-plausibility';

export type AncLabTest =
  | 'HCT'
  | 'HB'
  | 'HBSAG'
  | 'VDRL_RPR'
  | 'TREPONEMAL'
  | 'SYPHILIS_UNSPECIFIED'
  | 'HIV'
  | 'DCIP'
  | 'OF'
  | 'HB_TYPING'
  | 'MCV'
  | 'MCH'
  | 'BLOOD_GROUP'
  | 'RH'
  | 'GST'
  | 'OGTT_FASTING'
  | 'OGTT_1H'
  | 'OGTT_2H'
  | 'OGTT_3H'
  | 'OGTT_UNSPECIFIED'
  | 'CD4'
  | 'URINE_ALBUMIN'
  | 'URINE_SUGAR'
  | 'ALPHA1'
  | 'THAL_RESULT'
  | 'PARTNER_OF'
  | 'PARTNER_DCIP'
  | 'PARTNER_HB_TYPING'
  | 'PARTNER_ALPHA1'
  | 'PARTNER_THAL_RESULT';

export type AncLabSource = 'anc_lab' | 'lab_order' | 'person_anc';

export type AncLabInterpretation =
  'negative' | 'positive' | 'abnormal' | 'unknown' | 'missing' | 'concealed';

export interface QualitativeResultForm {
  pattern: RegExp;
  interpretation: Extract<AncLabInterpretation, 'negative' | 'positive' | 'abnormal' | 'unknown'>;
  /** Shown instead of the raw text, which would mean nothing to a reader. */
  display?: string;
  /** Recorded on the row so a later step can recognise this exact form. */
  note?: typeof ANC_LAB_RH_FORM_WORD_NOTE;
}

/** A bare "negative" in the ANC form's Rh field, which is not a reliable sign. */
export const ANC_LAB_RH_FORM_WORD_NOTE = 'rh_word_on_form';

export type AncLabResultShape =
  | { kind: 'numeric'; min: number; max: number }
  /** `forms` replaces the shared table for a test that reads results its own way. */
  | { kind: 'qualitative'; forms?: readonly QualitativeResultForm[] }
  /** HOSxP lookup codes, which may be digits; anything unlisted stays unknown. */
  | { kind: 'coded'; forms: readonly QualitativeResultForm[] }
  | { kind: 'blood_group' }
  | { kind: 'text' };

export interface AncLabTestDefinition {
  shape: AncLabResultShape;
  /** Overrides `shape` for rows from a source that writes this test differently. */
  sourceShapes?: Partial<Record<AncLabSource, AncLabResultShape>>;
  /**
   * Outcome never stored in a plaintext column; see cached_anc_lab_results.
   * Cannot combine with sourceShapes: a stored result is re-read by test alone.
   */
  sensitive?: boolean;
}

const QUALITATIVE: AncLabResultShape = { kind: 'qualitative' };

const RH_POSITIVE: QualitativeResultForm = {
  pattern: /^((rh\s*)?(pos|positive|post)|\+)$/i,
  interpretation: 'positive',
};

/**
 * Rh takes explicit signs only. For an infection screen ปกติ or N means
 * negative, the good result; for Rh that reading would report a normal woman
 * as Rh-negative. A bare dash is not a sign either: it often means not done.
 */
const RH_RESULT_FORMS: readonly QualitativeResultForm[] = [
  { pattern: /^(rh\s*)?(neg|negative)$/i, interpretation: 'negative' },
  RH_POSITIVE,
];

/**
 * The ANC form needs the factor named before it counts as Rh-negative. At 11011
 * it says NEGATIVE or neg on about 99% of rows while that hospital's own lab
 * reports Rh neg on 0.4%, so there the bare word means nothing was abnormal.
 */
const RH_ANC_FORM_RESULT_FORMS: readonly QualitativeResultForm[] = [
  { pattern: /^rh\s*(neg|negative)$/i, interpretation: 'negative' },
  { pattern: /^(neg|negative)$/i, interpretation: 'unknown', note: ANC_LAB_RH_FORM_WORD_NOTE },
  RH_POSITIVE,
];

const RH_SHAPE_BY_SOURCE = {
  anc_lab: { kind: 'qualitative', forms: RH_ANC_FORM_RESULT_FORMS },
} as const satisfies AncLabTestDefinition['sourceShapes'];

const THAL_NORMAL = { interpretation: 'negative', display: 'ปกติ' } as const;
const THAL_ABNORMAL = { interpretation: 'abnormal', display: 'ผิดปกติ' } as const;

/** person_anc flags, from lookup_normal: Y is ปกติ, N is ผิดปกติ. Not yes and no. */
const THAL_FLAG: AncLabResultShape = {
  kind: 'coded',
  forms: [
    { pattern: /^Y$/, ...THAL_NORMAL },
    { pattern: /^N$/, ...THAL_ABNORMAL },
  ],
};

/** thalassaemia_result ids. HOSxP treats 3 (not tested) and 4 (awaiting) as no result. */
const THAL_RESULT_ID: AncLabResultShape = {
  kind: 'coded',
  forms: [
    { pattern: /^1$/, ...THAL_NORMAL },
    { pattern: /^2$/, ...THAL_ABNORMAL },
  ],
};

// Data-quality bounds for plasma glucose, mg/dL; not diagnostic thresholds.
const GLUCOSE: AncLabResultShape = { kind: 'numeric', min: 10, max: 900 };

export const ANC_LAB_TESTS: Record<AncLabTest, AncLabTestDefinition> = {
  HCT: {
    shape: { kind: 'numeric', min: HCT_PCT_PLAUSIBLE_MIN, max: HCT_PCT_PLAUSIBLE_MAX },
  },
  HB: { shape: { kind: 'numeric', min: 0.1, max: HB_G_DL_PLAUSIBLE_MAX } },
  HBSAG: { shape: QUALITATIVE },
  VDRL_RPR: { shape: QUALITATIVE, sensitive: true },
  TREPONEMAL: { shape: QUALITATIVE, sensitive: true },
  SYPHILIS_UNSPECIFIED: { shape: QUALITATIVE, sensitive: true },
  HIV: { shape: QUALITATIVE, sensitive: true },
  DCIP: { shape: QUALITATIVE, sourceShapes: { person_anc: THAL_FLAG } },
  OF: { shape: QUALITATIVE, sourceShapes: { person_anc: THAL_FLAG } },
  HB_TYPING: { shape: { kind: 'text' }, sourceShapes: { person_anc: THAL_FLAG } },
  // Genetic results, and the partner is a third party who is not the patient.
  ALPHA1: { shape: THAL_FLAG, sensitive: true },
  THAL_RESULT: { shape: THAL_RESULT_ID, sensitive: true },
  PARTNER_OF: { shape: THAL_FLAG, sensitive: true },
  PARTNER_DCIP: { shape: THAL_FLAG, sensitive: true },
  PARTNER_HB_TYPING: { shape: THAL_FLAG, sensitive: true },
  PARTNER_ALPHA1: { shape: THAL_FLAG, sensitive: true },
  PARTNER_THAL_RESULT: { shape: THAL_RESULT_ID, sensitive: true },
  MCV: { shape: { kind: 'numeric', min: 40, max: 140 } },
  MCH: { shape: { kind: 'numeric', min: 10, max: 50 } },
  BLOOD_GROUP: { shape: { kind: 'blood_group' } },
  RH: {
    shape: { kind: 'qualitative', forms: RH_RESULT_FORMS },
    sourceShapes: RH_SHAPE_BY_SOURCE,
  },
  GST: { shape: GLUCOSE },
  OGTT_FASTING: { shape: GLUCOSE },
  OGTT_1H: { shape: GLUCOSE },
  OGTT_2H: { shape: GLUCOSE },
  OGTT_3H: { shape: GLUCOSE },
  OGTT_UNSPECIFIED: { shape: GLUCOSE },
  CD4: { shape: { kind: 'numeric', min: 0, max: 5000 }, sensitive: true },
  URINE_ALBUMIN: { shape: QUALITATIVE },
  URINE_SUGAR: { shape: QUALITATIVE },
};

export interface AncLabNameRule {
  /** Matched against the normalised name (lower case, no [ปิด]/numbering prefix). */
  pattern: RegExp;
  /** null = a known look-alike that must stay unclassified. */
  test: AncLabTest | null;
  /** Only rows from these sources may match. */
  sources?: readonly AncLabSource[];
  /** The normalised ANC catalogue name must also match. */
  requireAncLabName?: RegExp;
}

/** First match wins, so look-alikes come before the tests they resemble. */
export const ANC_LAB_NAME_RULES: readonly AncLabNameRule[] = [
  // Look-alikes.
  { pattern: /^hct\s*\(grade\)/, test: null }, // 11001: a grade, not a percent
  { pattern: /^hb\s*a1c|^hba1c/, test: null },
  { pattern: /^hbe\b|^hbeag/, test: null },
  { pattern: /^cbc\s*\(automation\)|^cbc$/, test: null }, // panel header, no value
  { pattern: /hiv.*(viral|\bvl\b|rna)/, test: null },

  { pattern: /\bhb\s*typing\b|^hemoglobin\s*typing/, test: 'HB_TYPING' },
  { pattern: /^hbs\s*ag\b|^hbsag\b/, test: 'HBSAG' },
  {
    pattern: /^(cbc\s*:\s*)?(hb|hgb|hemoglobin|haemoglobin)(\s*\(hgb\))?$/,
    test: 'HB',
    // No ANC catalogue has hemoglobin, and "HB" there can mean Hepatitis B.
    sources: ['lab_order'],
  },
  {
    pattern: /^(cbc\s*:\s*)?(hct|hematocrit|haematocrit)(\s*\(hct\))?(\s*anc)?(\s*\d+)?$/,
    test: 'HCT',
  },
  { pattern: /\bvdrl\b|\brpr\b/, test: 'VDRL_RPR' },
  { pattern: /treponema|\btpha\b/, test: 'TREPONEMAL' },
  { pattern: /^syphilis/, test: 'SYPHILIS_UNSPECIFIED' },
  { pattern: /hiv/, test: 'HIV' },
  { pattern: /^dcip\b/, test: 'DCIP' },
  { pattern: /^of(\s+test)?$/, test: 'OF' },
  { pattern: /^(cbc\s*:\s*)?mcv$/, test: 'MCV' },
  { pattern: /^(cbc\s*:\s*)?mch$/, test: 'MCH' },
  { pattern: /^blood\s*group|^abo\b/, test: 'BLOOD_GROUP' },
  { pattern: /^rh\b/, test: 'RH' },
  { pattern: /^gst\b/, test: 'GST' },
  { pattern: /^(ogtt|fbs).*ก่อน/, test: 'OGTT_FASTING' },
  { pattern: /^ogtt.*\b1\s*(hr|hour|ชม)/, test: 'OGTT_1H' },
  { pattern: /^ogtt.*\b2\s*(hr|hour|ชม)/, test: 'OGTT_2H' },
  { pattern: /^ogtt.*\b3\s*(hr|hour|ชม)/, test: 'OGTT_3H' },
  { pattern: /^ogtt/, test: 'OGTT_UNSPECIFIED' },
  // DTX n numbers the sample, not the hour, so the time point stays unknown.
  { pattern: /^dtx\s*\d+$/, test: 'OGTT_UNSPECIFIED', requireAncLabName: /ogtt/ },
  { pattern: /^cd4\b/, test: 'CD4' },
  { pattern: /^urine\s*albumin/, test: 'URINE_ALBUMIN' },
  { pattern: /^urine\s*sugar/, test: 'URINE_SUGAR' },
];

/**
 * person_anc thalassemia columns: char(1) flags and lookup ids, so "N" here is
 * abnormal, the opposite of N on an infection screen. The coding comes from
 * HOSxP and was confirmed in lookup_normal and thalassaemia_result at 3 sites.
 * These rows have no date, so they never set a journey column.
 * Labels are stored on each row and are how a row finds its test.
 */
export const ANC_THALASSEMIA_FIELDS: readonly {
  column: string;
  label: string;
  test: AncLabTest;
}[] = [
  { column: 'thalasseima_wife_of_result', label: 'Thalassemia: OF (ภรรยา)', test: 'OF' },
  { column: 'thalasseima_wife_dcip_result', label: 'Thalassemia: DCIP (ภรรยา)', test: 'DCIP' },
  {
    column: 'thalasseima_wife_hbtyping_result',
    label: 'Thalassemia: Hb typing (ภรรยา)',
    test: 'HB_TYPING',
  },
  { column: 'thalasseima_wife_alpha1_result', label: 'Thalassemia: Alpha-1 (ภรรยา)', test: 'ALPHA1' },
  { column: 'thalasseima_husband_of_result', label: 'Thalassemia: OF (สามี)', test: 'PARTNER_OF' },
  {
    column: 'thalasseima_husband_dcip_result',
    label: 'Thalassemia: DCIP (สามี)',
    test: 'PARTNER_DCIP',
  },
  {
    column: 'thalasseima_husband_hbtyping_result',
    label: 'Thalassemia: Hb typing (สามี)',
    test: 'PARTNER_HB_TYPING',
  },
  {
    column: 'thalasseima_husband_alpha1_result',
    label: 'Thalassemia: Alpha-1 (สามี)',
    test: 'PARTNER_ALPHA1',
  },
  { column: 'thalassaemia_result_id', label: 'Thalassemia: รหัสผลตรวจ (ภรรยา)', test: 'THAL_RESULT' },
  {
    column: 'husban_thalassaemia_result_id',
    label: 'Thalassemia: รหัสผลตรวจ (สามี)',
    test: 'PARTNER_THAL_RESULT',
  },
];

/**
 * AWAITING OBSTETRIC SIGN-OFF. Interim conservative rule: for these infections
 * a positive earlier in the pregnancy is not overridden by a later negative,
 * because a repeat negative may be a false negative and the rule for resolving
 * discordant results has not been agreed. Used for display only; it must not
 * reach risk levels, alerts or LINE notifications.
 */
export const ANC_LAB_STICKY_POSITIVE_TESTS: readonly AncLabTest[] = [
  'HBSAG',
  'HIV',
  'VDRL_RPR',
  'TREPONEMAL',
  'SYPHILIS_UNSPECIFIED',
];

/** Exact (trimmed) text meaning no result was recorded. */
export const MISSING_RESULT_FORMS: readonly RegExp[] = [/^$/, /^null$/i];

/** HOSxP's concealed marker: store no value and never infer one. */
export const CONCEALED_RESULT_FORMS: readonly RegExp[] = [/^ปกปิด$/];

/** Could be negative or a placeholder, so it is never read as either. */
export const AMBIGUOUS_RESULT_FORMS: readonly RegExp[] = [/^-$/];

/** Anything not listed here stays 'unknown'. */
export const QUALITATIVE_RESULT_FORMS: readonly QualitativeResultForm[] = [
  // Negative forms first, so Non-reactive and ไม่พบ can never read as positive.
  { pattern: /^(neg|negative|nr|n|ne|ปกติ|ไม่พบ)$/i, interpretation: 'negative' },
  { pattern: /^neg\b/i, interpretation: 'negative' },
  { pattern: /^non[- ]?react/i, interpretation: 'negative' },
  // Weak: neither a clear positive nor a negative.
  { pattern: /^w\+$/i, interpretation: 'abnormal' },
  { pattern: /^(pos|positive|possitive|reactive|r|พบ)$/i, interpretation: 'positive' },
  { pattern: /^pos\b/i, interpretation: 'positive' }, // Pos 1:8
  { pattern: /^\d?\+{1,4}$/, interpretation: 'positive' }, // +, ++, 2+, 3+
  { pattern: /^ผิดปกติ$/, interpretation: 'abnormal' },
];

/**
 * Hospital-side pre-filter for lab_order, which holds every lab a woman ever
 * had. LOWER(lab_items_name) LIKE terms; deliberately loose because the
 * classifier makes the final call. Interpolated into SQL, so constants only.
 */
export const ANC_LAB_ORDER_SQL_LIKE_TERMS: readonly string[] = [
  'hb%',
  '%hb typing%',
  'hgb%',
  'hemoglobin%',
  'haemoglobin%',
  'cbc:hb%',
  'cbc:hgb%',
  'cbc:hct%',
  'cbc:mcv%',
  'cbc:mch%',
  'hct%',
  'hematocrit%',
  'haematocrit%',
  'mcv%',
  'mch%',
  'vdrl%',
  '%rpr%',
  '%treponema%',
  '%syphilis%',
  '%hiv%',
  'dcip%',
  'of%',
  '%of test%',
  'blood group%',
  'abo%',
  'rh%',
  'gst%',
  'ogtt%',
  'fbs%',
  'dtx%',
  'cd4%',
  'urine albumin%',
  'urine sugar%',
];
