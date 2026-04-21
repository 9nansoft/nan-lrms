// Clinical profile catalog for the dev-mode simulator.
//
// A "profile" is a named clinical picture (low risk, preeclampsia, GDM, etc.)
// with well-defined ranges and lab-result distributions. It serves two roles:
//   1. Constraint for the LLM — the profile id + descriptor gets embedded in
//      the prompt, and the per-field JSON-schema bounds come from the profile
//      so the LLM can't drift out of band.
//   2. Deterministic fallback — when an LLM call fails or its output is
//      rejected by the evaluator, the simulator falls back to applyProfile()
//      which fills in coherent clinical values within the same bands.
//
// Every profile is aligned with rules in src/config/anc-risk-rules.ts so the
// downstream risk engine classifies the synthetic patient into the expected
// tier. See tests/unit/dev-simulation/profiles.test.ts for coherence checks.

import type { AncRiskLevel } from '@/types/domain';

/** Numeric range [min,max] inclusive. */
export interface NumericBand {
  min: number;
  max: number;
}

/** Discrete-value distribution. Keys are values, numbers are relative weights. */
export type Distribution<K extends string> = Record<K, number>;

export type UrineGrade = '-' | 'trace' | '+' | '++' | '+++';
export type DangerSign =
  | 'severe_headache'
  | 'blurred_vision'
  | 'epigastric_pain'
  | 'vaginal_bleeding'
  | 'reduced_fm'
  | 'fever'
  | 'rom'
  | 'convulsion';

export interface ClinicalProfile {
  id: string;
  riskLevel: AncRiskLevel | 'LOW' | 'HR1' | 'HR2' | 'HR3';
  /** Relative weight for weighted random picking. */
  weight: number;
  descTh: string;
  descEn: string;
  /** Free-text hint injected into the LLM prompt to steer narrative. */
  narrativeHint: string;
  // Clinical bands (units: mmHg / kg / cm / bpm / g·dL⁻¹ / %).
  bpSystolic: NumericBand;
  bpDiastolic: NumericBand;
  hbGDl: NumericBand;
  hctPct: NumericBand;
  fetalHr: NumericBand;
  heightCm: NumericBand;
  /** Pre-pregnancy weight. */
  prePregWeightKg: NumericBand;
  /** Total gestational weight gain at term. */
  totalWeightGainKg: NumericBand;
  ageYears: NumericBand;
  gravidaWeights: number[];  // index = gravida-1, value = weight
  // Dipstick distributions (weights).
  urineProtein: Distribution<UrineGrade>;
  urineGlucose: Distribution<UrineGrade>;
  // Lab / serology probabilities (0–1).
  rhNegProb: number;
  hbsagPosProb: number;
  hivPosProb: number;
  vdrlPosProb: number;
  ogttAbnormalProb: number;
  thalassemiaDiseaseProb: number;
  niptHighRiskProb: number;
  // Danger sign probabilities at any given visit (0–1).
  dangers: Partial<Record<DangerSign, number>>;
  /** Probability that the third-trimester "fetal movement ok" flag is false. */
  reducedFmProb: number;
  // Past medical history likelihood / label.
  pmh: { prob: number; labels: string[] };
  // Obstetric history hints — GTPAL.
  term: NumericBand;
  preterm: NumericBand;
  abortions: NumericBand;
  /** Tetanus toxoid dose cap (0–5). Higher for multi-gravida profiles. */
  ttDoseCap: number;
}

const CONTACT_RISK_TH: Record<string, string> = {
  LOW: 'ความเสี่ยงต่ำ',
  HR1: 'เสี่ยงสูง 1',
  HR2: 'เสี่ยงสูง 2',
  HR3: 'เสี่ยงสูง 3',
};

const UNIFORM_OK_DIST: Distribution<UrineGrade> = { '-': 80, 'trace': 10, '+': 7, '++': 2, '+++': 1 };

// ─── Profile catalog ──────────────────────────────────────────────────────

export const PROFILES: ClinicalProfile[] = [
  {
    id: 'low_risk',
    riskLevel: 'LOW',
    weight: 55,
    descTh: 'ฝากครรภ์ปกติ ไม่มีปัจจัยเสี่ยง',
    descEn: 'Routine ANC — no risk factors',
    narrativeHint: 'Routine ANC in a young healthy primi- or second-para woman. Vitals normal. No complaints.',
    bpSystolic: { min: 100, max: 128 },
    bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 11.0, max: 13.5 },
    hctPct: { min: 33, max: 40 },
    fetalHr: { min: 130, max: 158 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 45, max: 68 },
    totalWeightGainKg: { min: 9, max: 16 },
    ageYears: { min: 20, max: 34 },
    gravidaWeights: [50, 30, 15, 4, 1],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.01, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.03, labels: ['หอบหืดชนิดไม่รุนแรง'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'preeclampsia_mild',
    riskLevel: 'HR2',
    weight: 4,
    descTh: 'ครรภ์เป็นพิษระยะแรก (mild preeclampsia)',
    descEn: 'Mild preeclampsia — BP 140-155/90-100, proteinuria',
    narrativeHint: 'ANC visit showing elevated BP and trace-to-mild proteinuria. Headache intermittent.',
    bpSystolic: { min: 140, max: 155 },
    bpDiastolic: { min: 90, max: 102 },
    hbGDl: { min: 10.5, max: 13.0 },
    hctPct: { min: 32, max: 38 },
    fetalHr: { min: 130, max: 158 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 55, max: 85 },
    totalWeightGainKg: { min: 10, max: 20 },
    ageYears: { min: 20, max: 38 },
    gravidaWeights: [60, 25, 10, 4, 1],
    urineProtein: { '-': 5, 'trace': 25, '+': 50, '++': 15, '+++': 5 },
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.1, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: { severe_headache: 0.35, blurred_vision: 0.15 },
    reducedFmProb: 0.05,
    pmh: { prob: 0.15, labels: ['ความดันโลหิตสูงเรื้อรัง'] },
    term: { min: 0, max: 1 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 0 },
    ttDoseCap: 3,
  },
  {
    id: 'preeclampsia_severe',
    riskLevel: 'HR3',
    weight: 2,
    descTh: 'ครรภ์เป็นพิษรุนแรง (severe preeclampsia)',
    descEn: 'Severe preeclampsia — BP ≥160/100, proteinuria ≥++',
    narrativeHint: 'Severe preeclampsia: SBP ≥160, DBP ≥100, significant proteinuria, severe headache, possibly visual disturbance or epigastric pain. Urgent.',
    bpSystolic: { min: 160, max: 185 },
    bpDiastolic: { min: 100, max: 118 },
    hbGDl: { min: 9.5, max: 13.0 },
    hctPct: { min: 30, max: 38 },
    fetalHr: { min: 120, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 55, max: 88 },
    totalWeightGainKg: { min: 10, max: 22 },
    ageYears: { min: 20, max: 40 },
    gravidaWeights: [60, 25, 10, 4, 1],
    urineProtein: { '-': 0, 'trace': 0, '+': 10, '++': 45, '+++': 45 },
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.005, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.15, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: { severe_headache: 0.7, blurred_vision: 0.4, epigastric_pain: 0.35 },
    reducedFmProb: 0.1,
    pmh: { prob: 0.2, labels: ['ความดันโลหิตสูงเรื้อรัง'] },
    term: { min: 0, max: 1 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'gdm',
    riskLevel: 'HR2',
    weight: 6,
    descTh: 'เบาหวานในครรภ์ (GDM)',
    descEn: 'Gestational diabetes — abnormal OGTT, glucosuria likely',
    narrativeHint: 'GDM diagnosed on OGTT. Glucosuria on dipstick common. Usually asymptomatic at visit.',
    bpSystolic: { min: 105, max: 138 },
    bpDiastolic: { min: 65, max: 88 },
    hbGDl: { min: 10.5, max: 13.0 },
    hctPct: { min: 32, max: 38 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 58, max: 95 },
    totalWeightGainKg: { min: 10, max: 22 },
    ageYears: { min: 25, max: 40 },
    gravidaWeights: [35, 30, 20, 10, 5],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: { '-': 20, 'trace': 20, '+': 30, '++': 20, '+++': 10 },
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 1.0, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.04,
    pmh: { prob: 0.4, labels: ['ประวัติครอบครัวเบาหวาน'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'anemia_mild',
    riskLevel: 'HR1',
    weight: 5,
    descTh: 'ซีดไม่รุนแรง (Hb 9-10.9)',
    descEn: 'Mild anemia — Hb 9.0–10.9',
    narrativeHint: 'Mild anemia. Iron and folic acid supplementation emphasized.',
    bpSystolic: { min: 100, max: 128 },
    bpDiastolic: { min: 60, max: 80 },
    hbGDl: { min: 9.0, max: 10.9 },
    hctPct: { min: 27, max: 32 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 42, max: 62 },
    totalWeightGainKg: { min: 7, max: 14 },
    ageYears: { min: 17, max: 40 },
    gravidaWeights: [30, 30, 25, 10, 5],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.02, labels: [] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'anemia_severe',
    riskLevel: 'HR3',
    weight: 1.5,
    descTh: 'ซีดรุนแรง (Hb <9)',
    descEn: 'Severe anemia — Hb <9',
    narrativeHint: 'Severe anemia. Hematocrit <28%. Referral for evaluation.',
    bpSystolic: { min: 95, max: 125 },
    bpDiastolic: { min: 55, max: 78 },
    hbGDl: { min: 6.0, max: 8.9 },
    hctPct: { min: 22, max: 27 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 145, max: 165 },
    prePregWeightKg: { min: 40, max: 58 },
    totalWeightGainKg: { min: 5, max: 12 },
    ageYears: { min: 17, max: 40 },
    gravidaWeights: [20, 25, 30, 15, 10],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.005, vdrlPosProb: 0.005,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0.2, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.05,
    pmh: { prob: 0.3, labels: ['ธาลัสซีเมียพาหะ'] },
    term: { min: 0, max: 3 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 2 },
    ttDoseCap: 4,
  },
  {
    id: 'thalassemia_disease',
    riskLevel: 'HR2',
    weight: 2,
    descTh: 'ธาลัสซีเมีย (ผู้ป่วย)',
    descEn: 'Thalassemia disease',
    narrativeHint: 'Patient with thalassemia disease. Hb low-normal to mildly low. HbE-beta or similar genotype.',
    bpSystolic: { min: 100, max: 128 },
    bpDiastolic: { min: 60, max: 80 },
    hbGDl: { min: 8.5, max: 10.5 },
    hctPct: { min: 25, max: 32 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 145, max: 165 },
    prePregWeightKg: { min: 42, max: 60 },
    totalWeightGainKg: { min: 6, max: 12 },
    ageYears: { min: 20, max: 38 },
    gravidaWeights: [45, 30, 15, 8, 2],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 1.0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 1.0, labels: ['ธาลัสซีเมีย (HbE/β)'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'previous_csection',
    riskLevel: 'HR2',
    weight: 5,
    descTh: 'เคยผ่าตัดคลอด',
    descEn: 'Previous C-section',
    narrativeHint: 'Multipara with prior C-section scar. Vitals normal. Planning mode of delivery.',
    bpSystolic: { min: 100, max: 130 },
    bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 10.5, max: 13.0 },
    hctPct: { min: 32, max: 38 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 50, max: 78 },
    totalWeightGainKg: { min: 8, max: 16 },
    ageYears: { min: 23, max: 42 },
    gravidaWeights: [0, 35, 35, 20, 10],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.07, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.05, labels: [] },
    term: { min: 1, max: 3 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 5,
  },
  {
    id: 'rh_negative',
    riskLevel: 'HR2',
    weight: 1,
    descTh: 'หมู่เลือด Rh ลบ',
    descEn: 'Rh-negative mother',
    narrativeHint: 'Rh-negative mother. Monitor antibody titer. Anti-D prophylaxis planned.',
    bpSystolic: { min: 100, max: 130 },
    bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 11.0, max: 13.5 },
    hctPct: { min: 33, max: 40 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 48, max: 72 },
    totalWeightGainKg: { min: 9, max: 16 },
    ageYears: { min: 20, max: 38 },
    gravidaWeights: [40, 30, 20, 8, 2],
    urineProtein: UNIFORM_OK_DIST,
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 1.0, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.02, labels: [] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'hbsag_positive',
    riskLevel: 'HR2',
    weight: 3,
    descTh: 'ไวรัสตับอักเสบ B',
    descEn: 'HBsAg-positive',
    narrativeHint: 'HBsAg-positive carrier. Asymptomatic. Plan for neonatal HBIG + HBV vaccine.',
    bpSystolic: { min: 100, max: 130 }, bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 11.0, max: 13.5 }, hctPct: { min: 33, max: 40 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 50, max: 72 },
    totalWeightGainKg: { min: 9, max: 16 }, ageYears: { min: 20, max: 38 },
    gravidaWeights: [40, 30, 20, 8, 2],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 1.0, hivPosProb: 0.01, vdrlPosProb: 0.005,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.3, labels: ['HBV carrier'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'hiv_positive',
    riskLevel: 'HR2',
    weight: 1,
    descTh: 'ติดเชื้อ HIV',
    descEn: 'HIV-positive',
    narrativeHint: 'HIV-positive mother on ARV. PMTCT protocol. Viral load monitored.',
    bpSystolic: { min: 100, max: 128 }, bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 10.0, max: 12.5 }, hctPct: { min: 30, max: 37 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 45, max: 70 },
    totalWeightGainKg: { min: 8, max: 14 }, ageYears: { min: 20, max: 40 },
    gravidaWeights: [35, 30, 20, 10, 5],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.05, hivPosProb: 1.0, vdrlPosProb: 0.02,
    ogttAbnormalProb: 0.07, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.03,
    pmh: { prob: 1.0, labels: ['HIV on ARV'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'elderly_primi',
    riskLevel: 'HR1',
    weight: 3,
    descTh: 'อายุ ≥35 ครรภ์แรก',
    descEn: 'Elderly primigravida (≥35)',
    narrativeHint: 'First pregnancy at age ≥35. Otherwise healthy. Offered NIPT/quad-test.',
    bpSystolic: { min: 105, max: 135 }, bpDiastolic: { min: 65, max: 85 },
    hbGDl: { min: 11.0, max: 13.5 }, hctPct: { min: 33, max: 40 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 50, max: 75 },
    totalWeightGainKg: { min: 9, max: 16 }, ageYears: { min: 35, max: 44 },
    gravidaWeights: [100, 0, 0, 0, 0],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.12, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0.03,
    dangers: {},
    reducedFmProb: 0.02,
    pmh: { prob: 0.1, labels: ['ไทรอยด์ทำงานต่ำ'] },
    term: { min: 0, max: 0 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 2 },
    ttDoseCap: 2,
  },
  {
    id: 'adolescent_primi',
    riskLevel: 'HR1',
    weight: 2,
    descTh: 'อายุ <17 ครรภ์แรก',
    descEn: 'Adolescent primigravida (<17)',
    narrativeHint: 'Teenage first pregnancy. Support systems fragile. Nutrition counselling emphasized.',
    bpSystolic: { min: 95, max: 125 }, bpDiastolic: { min: 55, max: 78 },
    hbGDl: { min: 9.5, max: 12.5 }, hctPct: { min: 30, max: 37 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 145, max: 165 },
    prePregWeightKg: { min: 38, max: 55 },
    totalWeightGainKg: { min: 8, max: 14 }, ageYears: { min: 13, max: 16 },
    gravidaWeights: [100, 0, 0, 0, 0],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.003, vdrlPosProb: 0.005,
    ogttAbnormalProb: 0.03, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.03,
    pmh: { prob: 0.02, labels: [] },
    term: { min: 0, max: 0 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 0 },
    ttDoseCap: 2,
  },
  {
    id: 'grand_multipara',
    riskLevel: 'HR2',
    weight: 2,
    descTh: 'ครรภ์ที่ ≥5',
    descEn: 'Grand multipara (gravida ≥5)',
    narrativeHint: 'Grand multiparity. Monitor for uterine atony risk, PPH.',
    bpSystolic: { min: 100, max: 130 }, bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 9.5, max: 12.5 }, hctPct: { min: 30, max: 37 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 52, max: 80 },
    totalWeightGainKg: { min: 8, max: 16 }, ageYears: { min: 28, max: 44 },
    gravidaWeights: [0, 0, 0, 0, 100],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.03, hivPosProb: 0.003, vdrlPosProb: 0.005,
    ogttAbnormalProb: 0.1, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.03,
    pmh: { prob: 0.1, labels: ['ความดันเล็กน้อย'] },
    term: { min: 3, max: 5 }, preterm: { min: 0, max: 2 }, abortions: { min: 0, max: 2 },
    ttDoseCap: 5,
  },
  {
    id: 'post_term',
    riskLevel: 'HR1',
    weight: 1,
    descTh: 'ครรภ์เกินกำหนด (≥41w)',
    descEn: 'Post-term pregnancy',
    narrativeHint: 'Post-term pregnancy at 41-42 weeks. Fetal surveillance emphasized. Induction planned.',
    bpSystolic: { min: 100, max: 130 }, bpDiastolic: { min: 60, max: 82 },
    hbGDl: { min: 10.5, max: 13.0 }, hctPct: { min: 32, max: 38 },
    fetalHr: { min: 120, max: 158 },
    heightCm: { min: 150, max: 170 },
    prePregWeightKg: { min: 50, max: 75 },
    totalWeightGainKg: { min: 10, max: 18 }, ageYears: { min: 20, max: 38 },
    gravidaWeights: [50, 30, 15, 4, 1],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.07, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: { reduced_fm: 0.15 },
    reducedFmProb: 0.12,
    pmh: { prob: 0.02, labels: [] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 0 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'iugr',
    riskLevel: 'HR3',
    weight: 1,
    descTh: 'ทารกเจริญเติบโตช้าในครรภ์ (IUGR)',
    descEn: 'IUGR — small fetus relative to GA',
    narrativeHint: 'IUGR. Fundal height lags GA by ≥3 cm. Doppler studies, serial growth scans.',
    bpSystolic: { min: 100, max: 145 }, bpDiastolic: { min: 60, max: 92 },
    hbGDl: { min: 10.0, max: 13.0 }, hctPct: { min: 30, max: 38 },
    fetalHr: { min: 110, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 42, max: 65 },
    totalWeightGainKg: { min: 4, max: 10 }, ageYears: { min: 20, max: 40 },
    gravidaWeights: [55, 25, 15, 4, 1],
    urineProtein: { '-': 70, 'trace': 15, '+': 10, '++': 4, '+++': 1 },
    urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.003, vdrlPosProb: 0.005,
    ogttAbnormalProb: 0.05, thalassemiaDiseaseProb: 0.05, niptHighRiskProb: 0.02,
    dangers: { reduced_fm: 0.3 },
    reducedFmProb: 0.3,
    pmh: { prob: 0.1, labels: ['ความดันโลหิตสูงเรื้อรัง'] },
    term: { min: 0, max: 2 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
  {
    id: 'twin_dcda',
    riskLevel: 'HR2',
    weight: 1,
    descTh: 'ครรภ์แฝด DCDA',
    descEn: 'Twin pregnancy (DCDA)',
    narrativeHint: 'Dichorionic diamniotic twin pregnancy. Fundal height larger than GA.',
    bpSystolic: { min: 100, max: 135 }, bpDiastolic: { min: 60, max: 85 },
    hbGDl: { min: 9.5, max: 12.0 }, hctPct: { min: 28, max: 35 },
    fetalHr: { min: 130, max: 160 },
    heightCm: { min: 148, max: 168 },
    prePregWeightKg: { min: 50, max: 78 },
    totalWeightGainKg: { min: 14, max: 22 }, ageYears: { min: 22, max: 40 },
    gravidaWeights: [35, 30, 20, 10, 5],
    urineProtein: UNIFORM_OK_DIST, urineGlucose: UNIFORM_OK_DIST,
    rhNegProb: 0.005, hbsagPosProb: 0.02, hivPosProb: 0.002, vdrlPosProb: 0.003,
    ogttAbnormalProb: 0.15, thalassemiaDiseaseProb: 0, niptHighRiskProb: 0,
    dangers: {},
    reducedFmProb: 0.03,
    pmh: { prob: 0.05, labels: [] },
    term: { min: 0, max: 1 }, preterm: { min: 0, max: 1 }, abortions: { min: 0, max: 1 },
    ttDoseCap: 3,
  },
];

export const PROFILE_IDS = PROFILES.map((p) => p.id);

export function getProfileById(id: string): ClinicalProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

// ─── Weighted sampling ────────────────────────────────────────────────────

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function weightedPickKey<K extends string>(dist: Distribution<K>): K {
  const keys = Object.keys(dist) as K[];
  const weights = keys.map((k) => dist[k]);
  return weightedPick(keys, weights);
}

/** Picks a profile with weighted probability. */
export function sampleProfile(): ClinicalProfile {
  return weightedPick(
    PROFILES,
    PROFILES.map((p) => p.weight),
  );
}

function rnd(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}
function rndFloat(min: number, max: number, dp = 1): number {
  const v = min + Math.random() * (max - min);
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

/** Draws a single numeric value from a band. */
export function sampleBand(band: NumericBand, dp = 0): number {
  return dp === 0 ? rnd(band.min, band.max) : rndFloat(band.min, band.max, dp);
}
export function sampleGrade(dist: Distribution<UrineGrade>): UrineGrade {
  return weightedPickKey(dist);
}
export function sampleGravida(profile: ClinicalProfile): number {
  const weights = profile.gravidaWeights;
  const values = Array.from({ length: weights.length }, (_, i) => i + 1);
  return weightedPick(values, weights);
}
/** Returns true with probability p. */
export function coin(p: number): boolean {
  return Math.random() < p;
}

/** Picks zero or more danger signs based on per-sign probabilities. */
export function sampleDangers(profile: ClinicalProfile): DangerSign[] {
  const out: DangerSign[] = [];
  for (const [sign, prob] of Object.entries(profile.dangers)) {
    if (coin(prob as number)) out.push(sign as DangerSign);
  }
  return out;
}

/** All the narrative seed we pass to the LLM to steer output. */
export function profilePromptHint(profile: ClinicalProfile): string {
  const tier = CONTACT_RISK_TH[String(profile.riskLevel)] ?? String(profile.riskLevel);
  return `Profile: ${profile.descEn} (${tier}). ${profile.narrativeHint}`;
}
