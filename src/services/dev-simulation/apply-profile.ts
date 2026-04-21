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
