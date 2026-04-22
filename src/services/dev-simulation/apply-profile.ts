// Deterministic fallback generator — fills clinical records from a profile's
// bands without involving the LLM. Used when:
//   • LLM call fails / times out
//   • LLM response is rejected by the evaluator
//   • A generator wants a quick baseline without a model round-trip
//
// Output shapes match the webhook payloads in services/webhook.ts so the
// orchestrator can hand them off to the real webhook endpoint unchanged.

import type {
  WebhookAncPatient,
  WebhookAncVisit,
  WebhookPartographObservation,
  WebhookPatientPayload,
} from '@/services/webhook';
import {
  coin,
  sampleBand,
  sampleDangers,
  sampleGrade,
  sampleGravida,
  type ClinicalProfile,
} from './profiles';

// ─── Helpers ──────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rnd(min: number, max: number): number {
  return Math.round(min + Math.random() * (max - min));
}
function rndFloat(min: number, max: number, dp = 1): number {
  const v = min + Math.random() * (max - min);
  return Math.round(v * 10 ** dp) / 10 ** dp;
}

// ─── Labor event (full clinical record) ───────────────────────────────────

export interface DeterministicLaborInput {
  profile: ClinicalProfile;
  name: string;
  hn: string;
  an: string;
  cid: string;
  gaWeeks: number;
  gravida: number;
  ancCount: number;
  admitIso: string;
}

export function applyProfileToLabor(input: DeterministicLaborInput): WebhookPatientPayload {
  const p = input.profile;
  const height = sampleBand(p.heightCm);
  const preWeight = sampleBand(p.prePregWeightKg);
  const weightGain = sampleBand(p.totalWeightGainKg);
  const weightNow = preWeight + weightGain;
  return {
    hn: input.hn,
    an: input.an,
    name: input.name,
    cid: input.cid,
    age: sampleBand(p.ageYears),
    gravida: input.gravida,
    ga_weeks: input.gaWeeks,
    anc_count: input.ancCount,
    admit_date: input.admitIso,
    height_cm: height,
    weight_kg: weightNow,
    weight_diff_kg: weightGain,
    // Fundal height typically tracks GA ± 2 cm for singleton term pregnancies.
    // IUGR profile biases low, twin profile biases high.
    fundal_height_cm: Math.max(
      16,
      Math.min(42,
        input.gaWeeks +
          (p.id === 'iugr' ? -rndFloat(3, 6) : p.id === 'twin_dcda' ? rndFloat(2, 5) : rndFloat(-2, 2)),
      ),
    ),
    us_weight_g: p.id === 'iugr'
      ? rnd(1800, 2400)
      : p.id === 'twin_dcda'
        ? rnd(2200, 2900)  // each twin
        : rnd(2500, 4200),
    hematocrit_pct: sampleBand(p.hctPct),
    labor_status: 'ACTIVE',
  };
}

// ─── ANC visit (single record) ────────────────────────────────────────────

export function applyProfileToAncVisit(
  profile: ClinicalProfile,
  gaWeeks: number,
  visitNumber: number,
  visitDateIso: string,
): WebhookAncVisit {
  const dangers = sampleDangers(profile);
  // TT schedule: 1st ~GA 12, 2nd ~GA 20, 3rd ~6 months later (next pregnancy).
  const ttDoseNo = Math.min(profile.ttDoseCap, Math.max(0, Math.floor(gaWeeks / 8)));

  // ─── RTCOG OB 66-029 (2566) per-visit additions ───────────────────────
  // Vaccines given at this visit. Tdap recommended 27–36w each pregnancy
  // (high uptake modeled at 85%); Influenza opportunistic in any trimester;
  // COVID rare.
  const vaccinesGiven: NonNullable<WebhookAncVisit['vaccinesGiven']> = [];
  if (gaWeeks >= 27 && gaWeeks <= 36 && coin(0.85)) {
    vaccinesGiven.push({ type: 'TDAP', givenAtGa: gaWeeks });
  }
  if (coin(0.3)) {
    vaccinesGiven.push({ type: 'INFLUENZA', givenAtGa: gaWeeks });
  }
  if (coin(0.05)) {
    vaccinesGiven.push({ type: 'COVID', givenAtGa: gaWeeks });
  }

  // T3 fetal wellbeing (≥28w) — NST always on schedule in real clinics, BPP
  // selectively, Doppler for IUGR / multiples.
  const t3 = gaWeeks >= 28;
  const nstResult: WebhookAncVisit['nstResult'] =
    t3 && coin(0.6) ? (coin(0.92) ? 'REACTIVE' : 'NON_REACTIVE') : null;
  const bppScore: WebhookAncVisit['bppScore'] =
    t3 && coin(0.3) ? rnd(6, 10) : null;
  const iugrLike = profile.id === 'iugr' || profile.id === 'twin_dcda';
  const umbilicalDopplerResult: WebhookAncVisit['umbilicalDopplerResult'] =
    t3 && (iugrLike ? coin(0.6) : coin(0.15))
      ? (iugrLike ? (coin(0.55) ? 'ABNORMAL' : 'NORMAL') : 'NORMAL')
      : null;

  // Psychosocial screen — booking visit only (visit #1).
  const psychosocialScreen: WebhookAncVisit['psychosocialScreen'] =
    visitNumber === 1
      ? {
          alcohol: coin(0.04),
          smoking: coin(0.05),
          illicitDrugs: coin(0.01),
          depressionPhq: rnd(0, 9),
          domesticViolence: coin(0.02),
        }
      : null;

  return {
    date: visitDateIso.slice(0, 10),
    visitNumber,
    gaWeeks,
    fundalHeightCm: Math.max(
      16,
      Math.min(40,
        profile.id === 'iugr' ? gaWeeks - rndFloat(2, 5)
        : profile.id === 'twin_dcda' ? gaWeeks + rndFloat(2, 5)
        : gaWeeks + rndFloat(-2, 2),
      ),
    ),
    weightKg: sampleBand({
      min: profile.prePregWeightKg.min + Math.max(0, Math.floor(gaWeeks / 4)),
      max: profile.prePregWeightKg.max + Math.min(profile.totalWeightGainKg.max, Math.floor(gaWeeks / 2)),
    }),
    bpSystolic: sampleBand(profile.bpSystolic),
    bpDiastolic: sampleBand(profile.bpDiastolic),
    fetalHr: sampleBand(profile.fetalHr),
    presentation: gaWeeks >= 36
      ? pick(['CEPHALIC', 'CEPHALIC', 'CEPHALIC', 'BREECH', 'TRANSVERSE'])
      : pick(['CEPHALIC', 'CEPHALIC', 'BREECH', 'TRANSVERSE']),
    engagement: gaWeeks >= 37
      ? pick(['ENGAGED', 'ENGAGED', 'FLOATING'])
      : 'FLOATING',
    urineProtein: sampleGrade(profile.urineProtein),
    urineGlucose: sampleGrade(profile.urineGlucose),
    hbGDl: Number(sampleBand(profile.hbGDl, 1).toFixed(1)),
    hctPct: sampleBand(profile.hctPct),
    ttDoseNo,
    ironFolicGiven: coin(0.9),
    calciumGiven: coin(0.85),
    dangerSigns: dangers,
    fetalMovementOk: gaWeeks >= 28 ? !coin(profile.reducedFmProb) : null,
    // RTCOG OB 66-029 additions.
    vaccinesGiven: vaccinesGiven.length > 0 ? vaccinesGiven : null,
    urineKetone: coin(0.9) ? '-' : pick(['trace', '+', '+']),
    urineCultureResult:
      visitNumber === 1 ? (coin(0.95) ? 'NEGATIVE' : 'POSITIVE') : null,
    iodineGiven: coin(0.85),
    multivitaminGiven: coin(0.6),
    vitaminDIu: coin(0.4) ? pick([1000, 1500, 2000]) : null,
    nstResult,
    bppScore,
    umbilicalDopplerResult,
    psychosocialScreen,
  };
}

// ─── ANC journey-level labs ───────────────────────────────────────────────

export interface DeterministicAncInput {
  profile: ClinicalProfile;
  name: string;
  hn: string;
  cid: string;
  birthday: string;
  gravida: number;
  lmpIso: string;
  edcIso: string;
  changwatCode: string;
  amphurCode: string;
  visits: WebhookAncVisit[];
  /** Current gestational age — used to gate when time-sensitive results
   *  (GBS 35–37w, anatomy scan ≥22w) can plausibly exist. */
  currentGa?: number;
}

export function applyProfileToAnc(input: DeterministicAncInput): WebhookAncPatient {
  const p = input.profile;
  const rh = coin(p.rhNegProb) ? 'NEG' : 'POS';
  const hbsag = coin(p.hbsagPosProb) ? 'POS' : 'NEG';
  const vdrl = coin(p.vdrlPosProb) ? 'POS' : 'NEG';
  const hiv = coin(p.hivPosProb) ? 'POS' : 'NEG';
  const ogtt = coin(p.ogttAbnormalProb) ? 'ABNORMAL' : 'NORMAL';
  // GTPAL budget — previous pregnancies only. For first pregnancy (gravida=1)
  // every GTPAL count must be 0. Scale down profile samples to fit.
  const budget = Math.max(0, input.gravida - 1);
  let term = sampleBand(p.term);
  let preterm = sampleBand(p.preterm);
  let abortions = sampleBand(p.abortions);
  const total = term + preterm + abortions;
  if (total > budget) {
    const scale = budget / total;
    term = Math.floor(term * scale);
    preterm = Math.floor(preterm * scale);
    abortions = Math.max(0, budget - term - preterm);
  }
  const living = Math.max(0, term + preterm);
  const pmh = coin(p.pmh.prob) && p.pmh.labels.length > 0 ? pick(p.pmh.labels) : null;

  // ─── RTCOG OB 66-029 (2566) journey-level additions ──────────────────
  const ga = input.currentGa ?? 20;

  // Thalassemia — carrier-screening at booking. "thalassemia_disease" profile
  // always results in a real disease tag; other profiles are mostly normal /
  // trait, with occasional pending (screen not yet done).
  const thalassemiaType: WebhookAncPatient['thalassemiaType'] =
    p.id === 'thalassemia_disease'
      ? pick(['BETA_THAL_HB_E', 'BETA_THAL_MAJOR', 'HB_H'] as const)
      : pick([
          'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'NORMAL',
          'TRAIT', 'TRAIT',
          null as unknown as 'NORMAL', // 5/14 chance: not yet screened (null)
        ]);
  const mcvFl =
    thalassemiaType === 'NORMAL'
      ? Number(rndFloat(80, 95, 1))
      : thalassemiaType === 'TRAIT'
        ? Number(rndFloat(65, 80, 1))
        : thalassemiaType == null
          ? null
          : Number(rndFloat(55, 70, 1));
  const dcipResult: WebhookAncPatient['dcipResult'] =
    thalassemiaType == null
      ? null
      : thalassemiaType === 'HB_H' || thalassemiaType === 'BETA_THAL_HB_E'
        ? 'POS'
        : thalassemiaType === 'TRAIT' && coin(0.3)
          ? 'POS'
          : 'NEG';
  const hbEResult: WebhookAncPatient['hbEResult'] =
    thalassemiaType == null
      ? null
      : thalassemiaType === 'BETA_THAL_HB_E'
        ? 'POS'
        : thalassemiaType === 'TRAIT' && coin(0.25)
          ? 'POS'
          : 'NEG';

  // Cervical screening — 60% reported done within last 3–5y.
  const cervicalDone = coin(0.6);
  const cervicalScreenType: WebhookAncPatient['cervicalScreenType'] = cervicalDone
    ? pick(['PAP', 'PAP', 'HPV'])
    : 'NONE';
  const cervicalScreenResult: WebhookAncPatient['cervicalScreenResult'] = cervicalDone
    ? pick(['NORMAL', 'NORMAL', 'NORMAL', 'NORMAL', 'ABNORMAL'])
    : null;
  const cervicalScreenDate = cervicalDone
    ? new Date(Date.now() - rnd(30, 365 * 4) * 86400_000).toISOString()
    : null;

  // Aneuploidy screening — T1 serum if <14w, Quad if 15-20w, cfDNA elective.
  const aneuploidyOffered = coin(0.7);
  const aneuploidyMethod: WebhookAncPatient['aneuploidyMethod'] = aneuploidyOffered
    ? ga < 14
      ? 'SERUM_T1'
      : ga < 21
        ? pick(['QUAD_T2', 'CFDNA'])
        : 'CFDNA'
    : 'NONE';
  const aneuploidyResult: WebhookAncPatient['aneuploidyResult'] =
    !aneuploidyOffered
      ? null
      : coin(p.niptHighRiskProb > 0.2 ? p.niptHighRiskProb : 0.02)
        ? 'HIGH_RISK'
        : 'LOW_RISK';

  // GBS rectovaginal culture — only plausible if GA already past ~35w.
  const gbsDone = ga >= 35 && coin(0.7);
  const gbsResult: WebhookAncPatient['gbsResult'] = gbsDone
    ? coin(0.82)
      ? 'NEG'
      : 'POS'
    : null;
  const gbsCollectedDate =
    gbsDone && input.lmpIso
      ? new Date(new Date(input.lmpIso).getTime() + 36 * 7 * 86400_000).toISOString()
      : null;

  // Anatomy scan — 18–22w. If patient already past 20w, 75% done.
  const anatomyDone = ga >= 20 && coin(0.75);
  const anatomyScanDate =
    anatomyDone && input.lmpIso
      ? new Date(new Date(input.lmpIso).getTime() + rnd(18, 22) * 7 * 86400_000).toISOString()
      : null;
  const anatomyScanResult: WebhookAncPatient['anatomyScanResult'] = anatomyDone
    ? coin(p.id === 'iugr' || p.id === 'twin_dcda' ? 0.25 : 0.03)
      ? 'ABNORMAL'
      : 'NORMAL'
    : null;
  const efwG = anatomyDone ? rnd(300, 650) : null;

  // Dating method — LMP most common in rural Thai ANC; US/ART rarer.
  const datingMethod: WebhookAncPatient['datingMethod'] = pick([
    'LMP', 'LMP', 'LMP', 'LMP', 'US', 'US', 'ART',
  ]);

  // RTCOG Section 6 binary HR3 flags — deliberately rare; triggered more
  // often on specific profiles so the CDSS has something to escalate on.
  const priorPeDvt = coin(0.005);
  const severeLungDisease = coin(0.003);
  const alloimmunizationCde =
    p.id === 'rh_negative' ? coin(0.2) : coin(0.001);
  const bariatricSurgeryHx = coin(0.01);
  const teratogenExposure = coin(0.004);
  const congenitalInfection = coin(0.002);

  // 24h proteinuria + creatinine — selectively quantified when hypertensive
  // profiles make proteinuria likely. Creatinine routinely drawn first visit.
  const quantifyProtein =
    p.id === 'preeclampsia_mild' || p.id === 'preeclampsia_severe'
      ? coin(0.7)
      : coin(0.05);
  const proteinuria24hMg = quantifyProtein
    ? p.id === 'preeclampsia_severe'
      ? rnd(500, 3000)
      : p.id === 'preeclampsia_mild'
        ? rnd(150, 600)
        : rnd(50, 300)
    : null;
  const creatinineMgDl = coin(0.6) ? Number(rndFloat(0.4, 1.1, 2)) : null;

  // GDM early-screen risk factors — list only the ones that apply to the
  // profile / gravida context. BMI flag comes from pre-preg weight range.
  const gdmRiskFactors: WebhookAncPatient['gdmRiskFactors'] = [];
  const midWeight = (p.prePregWeightKg.min + p.prePregWeightKg.max) / 2;
  // Rough BMI estimate assuming 158cm median height → BMI ≈ weight / 2.5.
  if (midWeight / 2.5 >= 30) gdmRiskFactors.push('bmi_over_30');
  if (p.id === 'gdm' || coin(0.15)) gdmRiskFactors.push('first_degree_dm');
  if (coin(0.03)) gdmRiskFactors.push('pcos');
  if (coin(0.04)) gdmRiskFactors.push('prior_macrosomia');
  if (coin(0.02)) gdmRiskFactors.push('steroid_use');
  if (p.id === 'gdm' && coin(0.4)) gdmRiskFactors.push('prior_igm');

  return {
    hn: input.hn,
    name: input.name,
    cid: input.cid,
    birthday: input.birthday,
    pregNo: input.gravida,
    lmp: input.lmpIso,
    edc: input.edcIso,
    riskLevel: String(p.riskLevel),
    changwatCode: input.changwatCode,
    amphurCode: input.amphurCode,
    visits: input.visits,
    bloodGroup: pick(['A', 'B', 'O', 'O', 'O', 'AB']),
    rhFactor: rh,
    hbsagResult: hbsag,
    vdrlResult: vdrl,
    hivResult: hiv,
    ogttResult: ogtt,
    termBirths: term,
    pretermBirths: preterm,
    abortions,
    livingChildren: living,
    pastMedicalHistory: pmh,
    // RTCOG OB 66-029 additions.
    mcvFl,
    dcipResult,
    hbEResult,
    thalassemiaType,
    cervicalScreenType,
    cervicalScreenResult,
    cervicalScreenDate,
    aneuploidyMethod,
    aneuploidyResult,
    gbsResult,
    gbsCollectedDate,
    anatomyScanDate,
    anatomyScanResult,
    efwG,
    datingMethod,
    proteinuria24hMg,
    creatinineMgDl,
    priorPeDvt,
    severeLungDisease,
    alloimmunizationCde,
    bariatricSurgeryHx,
    teratogenExposure,
    congenitalInfection,
    gdmRiskFactors: gdmRiskFactors.length > 0 ? gdmRiskFactors : null,
  };
}

// ─── Partograph observation (single row) ──────────────────────────────────

export interface DeterministicPartographInput {
  profile: ClinicalProfile;
  an: string;
  externalObservationId: string;
  hourNo: number;
  observeIso: string;
}

export function applyProfileToPartograph(input: DeterministicPartographInput): WebhookPartographObservation {
  const p = input.profile;
  // Progressive dilation: starts around 2-3cm at hour 0, reaches ~10cm by hour 8-10.
  const dilation = Math.min(10, rndFloat(Math.min(2 + input.hourNo * 0.6, 9), Math.min(3 + input.hourNo * 0.8, 10)));
  return {
    an: input.an,
    externalObservationId: input.externalObservationId,
    observeDatetime: input.observeIso,
    hourNo: input.hourNo,
    fetalHeartRate: sampleBand(p.fetalHr),
    amnioticFluid: pick(['I', 'C', 'M', 'B']),
    moulding: pick(['0', '+', '++', '+++']),
    cervicalDilationCm: Number(dilation.toFixed(1)),
    descentOfHead: pick(['5/5', '4/5', '3/5', '2/5', '1/5', '0/5']),
    contractionPer10Min: Math.min(5, 2 + Math.floor(input.hourNo / 2)),
    contractionDurationSec: rnd(20, 60),
    contractionStrength: pick(['mild', 'moderate', 'strong']),
    pulse: rnd(70, 100),
    bpSystolic: sampleBand(p.bpSystolic),
    bpDiastolic: sampleBand(p.bpDiastolic),
    temperature: rndFloat(36.4, 37.5),
    entryStaff: 'sim',
    entryDatetime: input.observeIso,
  };
}
